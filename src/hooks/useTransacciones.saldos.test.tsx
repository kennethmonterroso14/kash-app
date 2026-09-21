import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'
import { sesionFalsa } from '../test/sesionFalsa'
import { ConSesion } from '../test/ConSesion'
import { useTransacciones } from './useTransacciones'

/**
 * El saldo de las cuentas lo mueve el trigger `trigger_saldo_transaccion`, del
 * lado del servidor, en CADA escritura sobre `transacciones`. Y el slice de
 * cuentas vive en el `SesionProvider`, que está montado por encima del router:
 * navegar no lo vuelve a montar, así que queda viejo hasta un reload completo.
 *
 * El bug que esto tapa, y que estuvo en producción: agregabas un movimiento,
 * ibas al dashboard, y Patrimonio / Disponible real / Patrimonio neto seguían
 * con el saldo anterior. Las cifras del mes sí se actualizaban —`DashboardPage`
 * remonta y las vuelve a pedir— y por eso el registro parecía no haberse
 * guardado.
 *
 * Lo que se prueba es la regla completa: toda escritura que el servidor
 * acepta invalida los saldos, y **una que falla no**.
 */

let fallar = false

vi.mock('../lib/supabase', () => {
  const crear = () => {
    const q: Record<string, unknown> = { _op: 'select', _payload: undefined }
    const dev = () => q
    q.select = dev; q.order = dev; q.eq = dev; q.gte = dev; q.lte = dev
    q.is = dev; q.single = dev
    q.insert = (p: unknown) => { q._op = 'insert'; q._payload = p; return q }
    q.update = (p: unknown) => { q._op = 'update'; q._payload = p; return q }
    q.delete = () => { q._op = 'delete'; return q }
    q.then = (fn: (r: unknown) => unknown) => {
      if (q._op === 'select') return Promise.resolve({ data: [], error: null }).then(fn)
      if (fallar) return Promise.resolve({ data: null, error: { message: 'boom' } }).then(fn)
      const p = q._payload
      const con = (x: object) => ({ id: 'nueva', fecha: '2026-09-21', cantidad: -1000, ...x })
      return Promise.resolve({
        data: Array.isArray(p) ? p.map(con) : con((p ?? {}) as object),
        error: null,
      }).then(fn)
    }
    return q
  }
  return { supabase: { from: () => crear() } }
})

/** Sesión con un espía en la invalidación de cuentas. */
const conEspia = () => {
  const espia = vi.fn(async () => {})
  const base = sesionFalsa()
  const sesion = { ...base, refrescar: { ...base.refrescar, cuentas: espia } }
  const envoltura = ({ children }: { children: ReactNode }) => (
    <ConSesion sesion={sesion}>{children}</ConSesion>
  )
  return { espia, envoltura }
}

const montar = async (envoltura: ({ children }: { children: ReactNode }) => React.ReactElement) => {
  const { result } = renderHook(() => useTransacciones('u1', '2026-09'), { wrapper: envoltura })
  await waitFor(() => expect(result.current.loading).toBe(false))
  return result
}

beforeEach(() => { fallar = false })
afterEach(() => cleanup())

describe('useTransacciones invalida los saldos', () => {
  it('la carga inicial NO los invalida', async () => {
    const { espia, envoltura } = conEspia()
    await montar(envoltura)
    // Solo las escrituras mueven el saldo. Invalidar al leer sería una consulta
    // extra por cada montaje de página, gratis.
    expect(espia).not.toHaveBeenCalled()
  })

  it('agregar un movimiento los invalida', async () => {
    const { espia, envoltura } = conEspia()
    const result = await montar(envoltura)
    await result.current.addTxn({
      cuenta_id: 'c1', cantidad: -6500, descripcion: 'panal',
      categoria: 'Familia/Regalos', tipo: 'gasto',
    })
    expect(espia).toHaveBeenCalledTimes(1)
  })

  it('una transferencia los invalida — mueve DOS cuentas', async () => {
    const { espia, envoltura } = conEspia()
    const result = await montar(envoltura)
    await result.current.addTransferencia({
      deCuentaId: 'c1', aCuentaId: 'c2', cantidad: 50000,
      descripcion: 'Ahorro', fecha: '2026-09-21',
    })
    expect(espia).toHaveBeenCalledTimes(1)
  })

  it('borrar los invalida', async () => {
    const { espia, envoltura } = conEspia()
    const result = await montar(envoltura)
    await result.current.deleteTxn('x1')
    expect(espia).toHaveBeenCalledTimes(1)
  })

  it('deshacer un borrado los invalida', async () => {
    const { espia, envoltura } = conEspia()
    const result = await montar(envoltura)
    await result.current.restoreTxn({
      id: 'x1', cuenta_id: 'c1', fecha: '2026-09-20', cantidad: -5740,
      descripcion: 'comida', categoria: 'Comida/Restaurantes', tipo: 'gasto',
    })
    expect(espia).toHaveBeenCalledTimes(1)
  })

  it('editar los invalida — cambiar el monto cambia el saldo', async () => {
    const { espia, envoltura } = conEspia()
    const result = await montar(envoltura)
    await result.current.updateTxn('x1', {
      cantidad: -9999, descripcion: 'comida', categoria: 'Otros', fecha: '2026-09-20',
    })
    expect(espia).toHaveBeenCalledTimes(1)
  })

  it('una escritura que FALLA no los invalida', async () => {
    const { espia, envoltura } = conEspia()
    const result = await montar(envoltura)
    fallar = true
    const { error } = await result.current.addTxn({
      cuenta_id: 'c1', cantidad: -6500, descripcion: 'panal',
      categoria: 'Familia/Regalos', tipo: 'gasto',
    })
    expect(error).toBeTruthy()
    // Refrescar acá no rompería nada, pero pedir el saldo de nuevo después de
    // un fallo sugiere que algo cambió cuando no cambió nada.
    expect(espia).not.toHaveBeenCalled()
  })
})
