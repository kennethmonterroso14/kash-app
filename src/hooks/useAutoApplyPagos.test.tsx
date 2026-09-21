import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StrictMode } from 'react'
import { render, waitFor, cleanup } from '@testing-library/react'
import { sesionFalsa } from '../test/sesionFalsa'
import { ConSesion } from '../test/ConSesion'
import { useAutoApplyPagos } from './useAutoApplyPagos'

/**
 * Tarea 1.5.3. Este hook escribe GASTOS solo, sin confirmación y sin deshacer,
 * así que lo que hay que probar es lo que puede desaparecer plata o duplicarla:
 *
 *   - como máximo un periodo por pago y por corrida
 *   - idempotencia POR MES, para que editar `dia_del_mes` no re-aplique
 *   - el compare-and-swap: si otra pestaña ya avanzó el pago, no se inserta
 *   - un insert fallido NO deja avanzado `ultima_aplicacion`
 *   - el gasto se fecha en el VENCIMIENTO, no hoy
 */

interface Llamada {
  tabla: string
  op: 'select' | 'insert' | 'update'
  filtros: Record<string, unknown>
  payload?: Record<string, unknown>
}

let llamadas: Llamada[] = []
let pagos: Record<string, unknown>[] = []
/** El test hace fallar el insert de `transacciones` cuando esto es true. */
let insertTxnFalla = false
/** Simula que otra pestaña ya avanzó el pago: el CAS afecta 0 filas. */
let casAfecta0 = false

vi.mock('../lib/supabase', () => {
  const hacer = (tabla: string) => {
    const l: Llamada = { tabla, op: 'select', filtros: {} }
    llamadas.push(l)

    const resultado = () => {
      if (tabla === 'pagos_recurrentes' && l.op === 'select') return { data: pagos, error: null }
      if (tabla === 'pagos_recurrentes' && l.op === 'update') {
        // El CAS devuelve las filas afectadas; 0 = otra corrida se adelantó.
        return { data: casAfecta0 ? [] : [{ id: l.filtros.id }], error: null }
      }
      if (tabla === 'transacciones' && l.op === 'insert') {
        return insertTxnFalla
          ? { data: null, error: { message: 'insert rechazado' } }
          : { data: [{ id: 'txn-1' }], error: null }
      }
      return { data: [], error: null }
    }

    const q: Record<string, unknown> = {}
    q.select = () => ({ ...q, then: q.then })
    q.eq = (col: string, val: unknown) => { l.filtros[col] = val; return q }
    q.is = (col: string, val: unknown) => { l.filtros[col] = val; return q }
    q.insert = (payload: unknown) => { l.op = 'insert'; l.payload = payload as Record<string, unknown>; return q }
    q.update = (payload: unknown) => { l.op = 'update'; l.payload = payload as Record<string, unknown>; return q }
    q.then = (fn: (r: unknown) => unknown) => Promise.resolve(resultado()).then(fn)
    return q
  }
  return { supabase: { from: (t: string) => hacer(t) } }
})

// 2026-09-21. Un pago con dia_del_mes 5 ya venció este mes; uno con 28, no.
const HOY = new Date('2026-09-21T18:00:00Z')

const Sonda = ({ userId }: { userId: string }) => { useAutoApplyPagos(userId); return null }
const montar = (userId = 'u1') =>
  render(<ConSesion sesion={sesionFalsa()}><Sonda userId={userId} /></ConSesion>)

const pago = (extra: Partial<Record<string, unknown>> = {}) => ({
  id: 'p1', nombre: 'Netflix', monto: 11900, dia_del_mes: 5,
  cuenta_id: 'c1', categoria: 'Suscripciones',
  ultima_aplicacion: null, created_at: '2025-01-01T00:00:00Z',
  ...extra,
})

const inserts = () => llamadas.filter(l => l.tabla === 'transacciones' && l.op === 'insert')
const swaps = () => llamadas.filter(l => l.tabla === 'pagos_recurrentes' && l.op === 'update')

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(HOY)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  llamadas = []
  pagos = []
  insertTxnFalla = false
  casAfecta0 = false
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('useAutoApplyPagos', () => {
  it('aplica el vencimiento ya pasado, fechado EN el vencimiento y no hoy', async () => {
    pagos = [pago()]
    montar()
    await waitFor(() => expect(inserts()).toHaveLength(1))

    expect(inserts()[0].payload).toMatchObject({
      user_id: 'u1',
      cuenta_id: 'c1',
      fecha: '2026-09-05',       // el día 5, no el 21
      cantidad: -11900,          // gasto → negativo
      descripcion: 'Netflix',
      tipo: 'gasto',
    })
  })

  it('si el día del mes todavía no llegó, aplica el vencimiento del mes anterior', async () => {
    pagos = [pago({ dia_del_mes: 28 })]
    montar()
    await waitFor(() => expect(inserts()).toHaveLength(1))
    expect(inserts()[0].payload?.fecha).toBe('2026-08-28')
  })

  it('aplica COMO MÁXIMO un periodo, aunque haya meses de atraso', async () => {
    // Un pago sin aplicar desde enero: recuperar el atraso insertaría ocho
    // gastos retroactivos en meses ya cerrados, sin confirmación ni deshacer.
    pagos = [pago({ ultima_aplicacion: '2026-01-05' })]
    montar()
    await waitFor(() => expect(inserts()).toHaveLength(1))
    expect(inserts()).toHaveLength(1)
    expect(inserts()[0].payload?.fecha).toBe('2026-09-05')
  })

  it('no re-aplica un mes ya aplicado aunque se edite dia_del_mes', async () => {
    // El bug: al cambiar el día, el vencimiento nuevo ('2026-09-12') ordena
    // DESPUÉS del guardado ('2026-09-05') y el mes se aplicaba dos veces. Por
    // eso la comparación es por mes y no por fecha exacta.
    pagos = [pago({ dia_del_mes: 12, ultima_aplicacion: '2026-09-05' })]
    montar()
    await new Promise(r => setTimeout(r, 30))
    expect(inserts()).toHaveLength(0)
    expect(swaps()).toHaveLength(0)
  })

  it('no aplica un vencimiento anterior a la creación del pago', async () => {
    pagos = [pago({ dia_del_mes: 28, created_at: '2026-09-10T00:00:00Z' })]
    montar()
    await new Promise(r => setTimeout(r, 30))
    // El vencimiento sería 2026-08-28, antes de que el pago existiera.
    expect(inserts()).toHaveLength(0)
  })

  it('avanza ultima_aplicacion ANTES de insertar, con compare-and-swap', async () => {
    pagos = [pago()]
    montar()
    await waitFor(() => expect(inserts()).toHaveLength(1))

    // El swap va primero en el orden de llamadas.
    const iSwap = llamadas.findIndex(l => l.tabla === 'pagos_recurrentes' && l.op === 'update')
    const iInsert = llamadas.findIndex(l => l.tabla === 'transacciones' && l.op === 'insert')
    expect(iSwap).toBeGreaterThanOrEqual(0)
    expect(iSwap).toBeLessThan(iInsert)
    // Y la condición incluye el valor leído (null → `is null`).
    expect(swaps()[0].filtros).toMatchObject({ id: 'p1', user_id: 'u1', ultima_aplicacion: null })
    expect(swaps()[0].payload).toMatchObject({ ultima_aplicacion: '2026-09-05' })
  })

  it('el CAS usa el valor leído cuando ya había una aplicación previa', async () => {
    pagos = [pago({ ultima_aplicacion: '2026-07-05' })]
    montar()
    await waitFor(() => expect(inserts()).toHaveLength(1))
    expect(swaps()[0].filtros.ultima_aplicacion).toBe('2026-07-05')
  })

  it('si otra pestaña ya avanzó el pago, NO inserta el gasto', async () => {
    casAfecta0 = true
    pagos = [pago()]
    montar()
    await waitFor(() => expect(swaps()).toHaveLength(1))
    await new Promise(r => setTimeout(r, 30))
    expect(inserts()).toHaveLength(0)
  })

  it('un insert fallido revierte ultima_aplicacion al valor anterior', async () => {
    // Ante una falla se prefiere NO aplicar (recuperable a mano) sobre
    // duplicar, que descuadra el saldo y hay que cazarlo fila por fila.
    insertTxnFalla = true
    pagos = [pago({ ultima_aplicacion: '2026-07-05' })]
    montar()
    await waitFor(() => expect(swaps()).toHaveLength(2))

    expect(swaps()[0].payload?.ultima_aplicacion).toBe('2026-09-05')  // avance
    expect(swaps()[1].payload?.ultima_aplicacion).toBe('2026-07-05')  // reversión
  })

  it('en StrictMode, que invoca el efecto dos veces, inserta UNA sola vez', async () => {
    // El latch se marca ANTES del trabajo async justo por esto: con un guard
    // tardío, el doble montaje de StrictMode insertaba el gasto duplicado.
    pagos = [pago()]
    render(
      <StrictMode>
        <ConSesion sesion={sesionFalsa()}><Sonda userId="u1" /></ConSesion>
      </StrictMode>,
    )
    await waitFor(() => expect(inserts()).toHaveLength(1))
    await new Promise(r => setTimeout(r, 50))
    expect(inserts()).toHaveLength(1)
  })

  it('sin pagos activos no escribe nada', async () => {
    pagos = []
    montar()
    await new Promise(r => setTimeout(r, 30))
    expect(inserts()).toHaveLength(0)
    expect(swaps()).toHaveLength(0)
  })
})
