import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, cleanup, act } from '@testing-library/react'
import { useCuentas } from './useCuentas'

/**
 * El borrado de una cuenta tiene tres salidas (borrar, archivar, negarse) y un
 * caso de carrera. Lo que se prueba es que el hook haga en la base lo que
 * `decidirBajaCuenta` decidió — y que una negativa NO toque nada.
 */

// El estado de la base de mentira, por test.
let db: {
  saldo: number; movimientos: number; pagos: number; pagosActivos: number
  errorBorrar: { code: string; message: string } | null
}
let escrituras: { tabla: string; op: string; payload?: unknown }[]

vi.mock('../lib/supabase', () => {
  const crear = (tabla: string) => {
    const q: Record<string, unknown> = { _op: 'select', _payload: undefined, _filtros: {} as Record<string, unknown>, _head: false }
    const dev = () => q
    q.order = dev; q.single = dev
    q.select = (_c: string, opts?: { head?: boolean }) => { q._head = !!opts?.head; return q }
    q.eq = (col: string, v: unknown) => { (q._filtros as Record<string, unknown>)[col] = v; return q }
    q.update = (p: unknown) => { q._op = 'update'; q._payload = p; return q }
    q.delete = () => { q._op = 'delete'; return q }
    q.then = (fn: (r: unknown) => unknown) => {
      const f = q._filtros as Record<string, unknown>
      if (q._op !== 'select') {
        escrituras.push({ tabla, op: q._op as string, payload: q._payload })
        const error = q._op === 'delete' ? db.errorBorrar : null
        return Promise.resolve({ data: null, error }).then(fn)
      }
      if (q._head) {
        const count = tabla === 'transacciones' ? db.movimientos
          : f.activo ? db.pagosActivos : db.pagos
        return Promise.resolve({ data: null, count, error: null }).then(fn)
      }
      if (tabla === 'cuentas' && f.id) return Promise.resolve({ data: { saldo: db.saldo }, error: null }).then(fn)
      return Promise.resolve({
        data: [{ id: 'c1', nombre: 'BI', tipo: 'ahorro', saldo: db.saldo, color: '#fff', activa: true }],
        error: null,
      }).then(fn)
    }
    return q
  }
  return { supabase: { from: (t: string) => crear(t) } }
})

const montar = async () => {
  const { result } = renderHook(() => useCuentas('u1'))
  await waitFor(() => expect(result.current.loading).toBe(false))
  return result
}

beforeEach(() => {
  db = { saldo: 0, movimientos: 0, pagos: 0, pagosActivos: 0, errorBorrar: null }
  escrituras = []
})
afterEach(() => cleanup())

describe('useCuentas.eliminarCuenta', () => {
  it('sin historial la borra y la saca de la lista', async () => {
    const r = await montar()
    let res
    await act(async () => { res = await r.current.eliminarCuenta('c1') })
    expect(res).toEqual({ ok: 'borrada' })
    expect(escrituras).toEqual([{ tabla: 'cuentas', op: 'delete', payload: undefined }])
    expect(r.current.cuentas).toEqual([])
  })

  it('con movimientos la archiva (activa = false) en lugar de borrarla', async () => {
    db.movimientos = 4
    const r = await montar()
    let res
    await act(async () => { res = await r.current.eliminarCuenta('c1') })
    expect(res).toEqual({ ok: 'archivada' })
    expect(escrituras).toEqual([{ tabla: 'cuentas', op: 'update', payload: { activa: false } }])
    expect(r.current.cuentas).toEqual([])
  })

  it('con saldo se niega y no escribe nada', async () => {
    db.saldo = 150000
    const r = await montar()
    let res
    await act(async () => { res = await r.current.eliminarCuenta('c1') })
    expect(res).toEqual({ bloqueada: 'saldo' })
    expect(escrituras).toEqual([])
    expect(r.current.cuentas).toHaveLength(1)
  })

  it('con un pago fijo activo se niega', async () => {
    db.pagos = 1; db.pagosActivos = 1
    const r = await montar()
    let res
    await act(async () => { res = await r.current.eliminarCuenta('c1') })
    expect(res).toEqual({ bloqueada: 'pagos_fijos' })
    expect(escrituras).toEqual([])
  })

  it('si el borrado choca con la FK (apareció un movimiento), archiva', async () => {
    db.errorBorrar = { code: '23503', message: 'violates foreign key' }
    const r = await montar()
    let res
    await act(async () => { res = await r.current.eliminarCuenta('c1') })
    expect(res).toEqual({ ok: 'archivada' })
    expect(escrituras.map(e => e.op)).toEqual(['delete', 'update'])
  })

  it('otro error al borrar se informa sin texto crudo y la cuenta sigue', async () => {
    db.errorBorrar = { code: '500', message: 'internal' }
    const r = await montar()
    let res: unknown
    await act(async () => { res = await r.current.eliminarCuenta('c1') })
    expect(res).toHaveProperty('error')
    expect(JSON.stringify(res)).not.toMatch(/internal/)
    expect(r.current.cuentas).toHaveLength(1)
  })
})

describe('useCuentas.actualizarCuenta', () => {
  it('manda solo nombre (recortado), tipo y color — nunca el saldo', async () => {
    const r = await montar()
    let err
    await act(async () => { err = await r.current.actualizarCuenta('c1', { nombre: '  Nómina ', tipo: 'corriente', color: '#000' }) })
    expect(err).toBeNull()
    expect(escrituras).toEqual([{ tabla: 'cuentas', op: 'update', payload: { nombre: 'Nómina', tipo: 'corriente', color: '#000' } }])
    expect(r.current.cuentas[0]).toMatchObject({ nombre: 'Nómina', tipo: 'corriente', saldo: 0 })
  })
})
