import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'
import { sesionFalsa } from '../test/sesionFalsa'
import { ConSesion } from '../test/ConSesion'
import { usePresupuestos } from './usePresupuestos'

/**
 * Tarea 1.5.2. Se prueba lo que YA FALLÓ, no lo fácil:
 *
 *   - que la copia automática no resucite un presupuesto recién borrado
 *   - que no materialice presupuestos en meses futuros
 *   - que el banner y "Deshacer" sean alcanzables, y que deshacer no
 *     re-dispare la copia
 *   - que un fetch fallido no se tome por "mes vacío" (y por lo tanto no
 *     dispare la copia sobre un mes que sí tenía datos)
 */

interface Llamada {
  tabla: string
  op: 'select' | 'insert' | 'upsert' | 'update' | 'delete'
  filtros: Record<string, unknown>
  payload?: unknown
}

let llamadas: Llamada[] = []
/** El test decide qué devuelve cada lectura, por mes. */
let filasPorMes: Record<string, { id: string; categoria: string; monto_limite: number }[]> = {}
let errorEnSelect: string | null = null
let errorEnInsert: string | null = null

vi.mock('../lib/supabase', () => {
  const hacer = (tabla: string) => {
    const l: Llamada = { tabla, op: 'select', filtros: {} }
    llamadas.push(l)

    const resultado = () => {
      if (l.op === 'select') {
        if (errorEnSelect) return { data: null, error: { message: errorEnSelect } }
        const mes = String(l.filtros.mes ?? '')
        const filas = (filasPorMes[mes] ?? []).map(f => ({ ...f, mes }))
        return { data: filas, error: null }
      }
      if (l.op === 'insert') {
        if (errorEnInsert) return { data: null, error: { message: errorEnInsert } }
        const filas = (l.payload as Record<string, unknown>[]).map((f, i) => ({
          id: `nuevo-${i}`, categoria: f.categoria, monto_limite: f.monto_limite, mes: f.mes,
        }))
        return { data: filas, error: null }
      }
      if (l.op === 'upsert') {
        const f = l.payload as Record<string, unknown>
        return { data: [{ id: 'up-1', categoria: f.categoria, monto_limite: f.monto_limite, mes: f.mes }], error: null }
      }
      if (l.op === 'update') return { data: [{ id: l.filtros.id }], error: null }
      return { data: null, error: null }
    }

    const q: Record<string, unknown> = {}
    q.select = () => q
    q.order = () => q
    q.eq = (col: string, val: unknown) => { l.filtros[col] = val; return q }
    q.in = (col: string, vals: unknown) => { l.filtros[col] = vals; return q }
    q.insert = (payload: unknown) => { l.op = 'insert'; l.payload = payload; return q }
    q.upsert = (payload: unknown) => { l.op = 'upsert'; l.payload = payload; return q }
    q.update = (payload: unknown) => { l.op = 'update'; l.payload = payload; return q }
    q.delete = () => { l.op = 'delete'; return q }
    q.single = () => {
      const r = resultado()
      return Promise.resolve({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data })
    }
    q.maybeSingle = q.single
    q.then = (fn: (r: unknown) => unknown) => Promise.resolve(resultado()).then(fn)
    return q
  }
  return { supabase: { from: (tabla: string) => hacer(tabla) } }
})

// Congelado en septiembre de 2026 para que "mes futuro" sea determinista.
const HOY = new Date('2026-09-21T18:00:00Z')
const envoltura = ({ children }: { children: ReactNode }) => (
  <ConSesion sesion={sesionFalsa()}>{children}</ConSesion>
)

const inserts = () => llamadas.filter(l => l.op === 'insert')
const borrados = () => llamadas.filter(l => l.op === 'delete')

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(HOY)
  llamadas = []
  filasPorMes = {}
  errorEnSelect = null
  errorEnInsert = null
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('usePresupuestos — copia del mes anterior', () => {
  it('copia cuando el mes está vacío y el anterior tiene filas, y ofrece Deshacer', async () => {
    filasPorMes['2026-08-01'] = [
      { id: 'a', categoria: 'Supermercado', monto_limite: 200000 },
      { id: 'b', categoria: 'Transporte', monto_limite: 50000 },
    ]
    filasPorMes['2026-09-01'] = []

    const { result } = renderHook(() => usePresupuestos('u1', '2026-09'), { wrapper: envoltura })
    await waitFor(() => expect(result.current.banner).not.toBeNull())

    expect(result.current.banner?.n).toBe(2)
    expect(result.current.presupuestos).toHaveLength(2)
    // Los ids son los NUEVOS, no los del mes anterior: deshacer borra las
    // filas recién creadas, no las del mes que se copió.
    expect(result.current.banner?.ids).toEqual(['nuevo-0', 'nuevo-1'])
    expect(inserts()).toHaveLength(1)
    expect((inserts()[0].payload as { mes: string }[])[0].mes).toBe('2026-09-01')
  })

  it('el banner se esconde solo, pero las filas se quedan', async () => {
    filasPorMes['2026-08-01'] = [{ id: 'a', categoria: 'Supermercado', monto_limite: 200000 }]
    filasPorMes['2026-09-01'] = []

    const { result } = renderHook(() => usePresupuestos('u1', '2026-09'), { wrapper: envoltura })
    await waitFor(() => expect(result.current.banner).not.toBeNull())
    await act(async () => { vi.advanceTimersByTime(4100) })
    expect(result.current.banner).toBeNull()
    expect(result.current.presupuestos).toHaveLength(1)
  })

  it('NO copia si el mes ya tiene presupuestos', async () => {
    filasPorMes['2026-08-01'] = [{ id: 'a', categoria: 'Supermercado', monto_limite: 200000 }]
    filasPorMes['2026-09-01'] = [{ id: 'z', categoria: 'Salud', monto_limite: 30000 }]

    const { result } = renderHook(() => usePresupuestos('u1', '2026-09'), { wrapper: envoltura })
    await waitFor(() => expect(result.current.presupuestos).toHaveLength(1))
    await act(async () => { vi.advanceTimersByTime(100) })
    expect(inserts()).toHaveLength(0)
    expect(result.current.banner).toBeNull()
  })

  it('NO resucita lo borrado: borrar la última fila no vuelve a disparar la copia', async () => {
    // El bug: la copia se decidía con `presupuestos.length`, así que al quedar
    // la lista en 0 el efecto se re-disparaba y volvía a insertar justo lo que
    // el usuario acababa de borrar.
    filasPorMes['2026-08-01'] = [{ id: 'a', categoria: 'Supermercado', monto_limite: 200000 }]
    filasPorMes['2026-09-01'] = [{ id: 'z', categoria: 'Salud', monto_limite: 30000 }]

    const { result } = renderHook(() => usePresupuestos('u1', '2026-09'), { wrapper: envoltura })
    await waitFor(() => expect(result.current.presupuestos).toHaveLength(1))

    await act(async () => { await result.current.eliminar('z') })
    expect(result.current.presupuestos).toHaveLength(0)

    await act(async () => { vi.advanceTimersByTime(500) })
    expect(inserts()).toHaveLength(0)
    expect(result.current.banner).toBeNull()
  })

  it('NO materializa presupuestos en un mes futuro', async () => {
    // El bug: avanzar con "→" insertaba presupuestos en cada mes futuro que se
    // visitara, lo que está fuera de alcance por diseño.
    filasPorMes['2026-09-01'] = [{ id: 'a', categoria: 'Supermercado', monto_limite: 200000 }]
    filasPorMes['2026-10-01'] = []

    const { result } = renderHook(() => usePresupuestos('u1', '2026-10'), { wrapper: envoltura })
    await waitFor(() => expect(result.current.cargando).toBe(false))
    await act(async () => { vi.advanceTimersByTime(500) })

    expect(inserts()).toHaveLength(0)
    expect(result.current.presupuestos).toHaveLength(0)
  })

  it('un fetch fallido no cuenta como mes vacío', async () => {
    // Si un error de red se tomara por "sin presupuestos", la copia correría
    // sobre un mes que en realidad sí tenía datos y los duplicaría.
    errorEnSelect = 'fallo de red'
    filasPorMes['2026-08-01'] = [{ id: 'a', categoria: 'Supermercado', monto_limite: 200000 }]

    const { result } = renderHook(() => usePresupuestos('u1', '2026-09'), { wrapper: envoltura })
    await waitFor(() => expect(result.current.errorLectura).toBe('fallo de red'))
    await act(async () => { vi.advanceTimersByTime(500) })

    expect(inserts()).toHaveLength(0)
    expect(result.current.presupuestos).toHaveLength(0)
  })
})

describe('usePresupuestos — deshacer', () => {
  it('borra las filas copiadas y no re-dispara la copia', async () => {
    filasPorMes['2026-08-01'] = [
      { id: 'a', categoria: 'Supermercado', monto_limite: 200000 },
      { id: 'b', categoria: 'Transporte', monto_limite: 50000 },
    ]
    filasPorMes['2026-09-01'] = []

    const { result } = renderHook(() => usePresupuestos('u1', '2026-09'), { wrapper: envoltura })
    await waitFor(() => expect(result.current.banner).not.toBeNull())

    await act(async () => { await result.current.deshacerCopia() })

    expect(result.current.presupuestos).toHaveLength(0)
    expect(result.current.banner).toBeNull()
    // Borra por los ids copiados, acotado al usuario.
    const del = borrados()
    expect(del).toHaveLength(1)
    expect(del[0].filtros.id).toEqual(['nuevo-0', 'nuevo-1'])
    expect(del[0].filtros.user_id).toBe('u1')

    // El latch queda puesto: la lista quedó vacía y eso NO debe re-copiar.
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(inserts()).toHaveLength(1)
  })
})

describe('usePresupuestos — escrituras acotadas', () => {
  it('agregar hace upsert por (user_id, categoria, mes)', async () => {
    filasPorMes['2026-09-01'] = [{ id: 'z', categoria: 'Salud', monto_limite: 30000 }]
    const { result } = renderHook(() => usePresupuestos('u1', '2026-09'), { wrapper: envoltura })
    await waitFor(() => expect(result.current.cargando).toBe(false))

    await act(async () => { expect(await result.current.agregar('Transporte', 75000)).toBeNull() })

    const up = llamadas.find(l => l.op === 'upsert')
    expect(up?.payload).toMatchObject({ user_id: 'u1', categoria: 'Transporte', monto_limite: 75000, mes: '2026-09-01' })
    expect(result.current.presupuestos).toHaveLength(2)
  })

  it('actualizar el límite va acotado por user_id y mes', async () => {
    // Sin acotar, un id de otro mes reescribiría un mes ya cerrado.
    filasPorMes['2026-09-01'] = [{ id: 'z', categoria: 'Salud', monto_limite: 30000 }]
    const { result } = renderHook(() => usePresupuestos('u1', '2026-09'), { wrapper: envoltura })
    await waitFor(() => expect(result.current.cargando).toBe(false))

    await act(async () => { expect(await result.current.actualizarLimite('z', 99900)).toBeNull() })

    const upd = llamadas.find(l => l.op === 'update')
    expect(upd?.filtros).toMatchObject({ id: 'z', user_id: 'u1', mes: '2026-09-01' })
    expect(result.current.presupuestos[0].monto_limite).toBe(99900)
  })

  it('eliminar también va acotado por user_id y mes', async () => {
    filasPorMes['2026-09-01'] = [{ id: 'z', categoria: 'Salud', monto_limite: 30000 }]
    const { result } = renderHook(() => usePresupuestos('u1', '2026-09'), { wrapper: envoltura })
    await waitFor(() => expect(result.current.cargando).toBe(false))

    await act(async () => { await result.current.eliminar('z') })

    expect(borrados()[0].filtros).toMatchObject({ id: 'z', user_id: 'u1', mes: '2026-09-01' })
  })
})
