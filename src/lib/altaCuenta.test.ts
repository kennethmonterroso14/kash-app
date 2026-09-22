import { describe, it, expect, vi, beforeEach } from 'vitest'
import { crearCuentaConSaldo } from './altaCuenta'

/**
 * Lo que importa acá es el camino que falla, no el que funciona.
 *
 * Crear una cuenta con saldo son DOS escrituras: la cuenta en 0 y un `ajuste`
 * que el trigger convierte en saldo. Si la segunda falla y no se compensa,
 * queda una cuenta huérfana en Q0.00 — y un reintento la duplica. Esa
 * compensación no tenía ningún test, y es de las cosas que solo se descubren
 * roto cuando ya pasó.
 */

type Resultado = { data?: unknown; error?: { message: string } | null }
let respuestas: Record<string, Resultado[]>
let borrados: { id: string; userId: string }[]

vi.mock('./supabase', () => {
  const siguiente = (tabla: string, op: string): Resultado => {
    const cola = respuestas[`${tabla}.${op}`] ?? []
    return cola.shift() ?? { data: null, error: null }
  }
  const crear = (tabla: string) => {
    const q: Record<string, unknown> = { _op: 'select', _id: '', _uid: '' }
    const dev = () => q
    q.select = dev; q.single = dev
    q.insert = (p: unknown) => { q._op = 'insert'; q._payload = p; return q }
    q.delete = () => { q._op = 'delete'; return q }
    q.eq = (col: string, val: string) => {
      if (col === 'id') q._id = val
      if (col === 'user_id') q._uid = val
      return q
    }
    q.then = (fn: (r: unknown) => unknown) => {
      if (q._op === 'delete') {
        borrados.push({ id: q._id as string, userId: q._uid as string })
      }
      return Promise.resolve(siguiente(tabla, q._op as string)).then(fn)
    }
    return q
  }
  return { supabase: { from: (t: string) => crear(t) } }
})

const ALTA = {
  userId: 'u1', nombre: '  BI Ahorros  ', tipo: 'ahorro', color: '#4ade80',
  saldoCentavos: 123400, hoy: '2026-09-22',
}
const CUENTA_OK = { data: { id: 'c1', nombre: 'BI Ahorros' }, error: null }

beforeEach(() => { respuestas = {}; borrados = [] })

describe('crearCuentaConSaldo', () => {
  it('con saldo: crea la cuenta y su ajuste, y no compensa nada', async () => {
    respuestas['cuentas.insert'] = [CUENTA_OK]
    respuestas['transacciones.insert'] = [{ error: null }]
    expect(await crearCuentaConSaldo(ALTA)).toBeNull()
    expect(borrados).toEqual([])
  })

  it('sin saldo: NO inserta ningún ajuste', async () => {
    respuestas['cuentas.insert'] = [CUENTA_OK]
    // Si insertara un ajuste de 0 el DB lo rechazaría (`cantidad != 0`), y
    // además sería una fila de ruido en el ledger de cada cuenta nueva.
    respuestas['transacciones.insert'] = [{ error: { message: 'no debía llamarse' } }]
    expect(await crearCuentaConSaldo({ ...ALTA, saldoCentavos: 0 })).toBeNull()
  })

  it('si falla el ajuste, BORRA la cuenta y reporta el error del ajuste', async () => {
    respuestas['cuentas.insert'] = [CUENTA_OK]
    respuestas['transacciones.insert'] = [{ error: { message: 'cantidad inválida' } }]
    respuestas['cuentas.delete'] = [{ error: null }]

    const fallo = await crearCuentaConSaldo(ALTA)
    expect(fallo).toBe('cantidad inválida')
    // Y borra ESA cuenta, del dueño: un delete sin los dos filtros es un
    // borrado ajeno esperando a pasar.
    expect(borrados).toEqual([{ id: 'c1', userId: 'u1' }])
  })

  it('si la compensación también falla, dice qué quedó a medias', async () => {
    respuestas['cuentas.insert'] = [CUENTA_OK]
    respuestas['transacciones.insert'] = [{ error: { message: 'timeout' } }]
    respuestas['cuentas.delete'] = [{ error: { message: 'sin permiso' } }]

    const fallo = await crearCuentaConSaldo(ALTA)
    // El usuario tiene una cuenta en Q0.00: hay que decírselo, no dejarlo con
    // un error genérico sobre una transacción que no sabe qué es.
    expect(fallo).toContain('timeout')
    expect(fallo).toContain('BI Ahorros')
    expect(fallo).toContain('Q0.00')
  })

  it('si falla la cuenta, no intenta el ajuste ni compensa', async () => {
    respuestas['cuentas.insert'] = [{ data: null, error: { message: 'nombre duplicado' } }]
    expect(await crearCuentaConSaldo(ALTA)).toBe('nombre duplicado')
    expect(borrados).toEqual([])
  })
})
