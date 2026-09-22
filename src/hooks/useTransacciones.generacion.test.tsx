import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'
import { sesionFalsa } from '../test/sesionFalsa'
import { ConSesion } from '../test/ConSesion'
import { useTransacciones } from './useTransacciones'

/**
 * Compañero de `useTransacciones.saldos.test.tsx`. Ese prueba que una escritura
 * invalida el slice de CUENTAS; este prueba que también incrementa la GENERACIÓN
 * de transacciones — la señal que hace que las OTRAS instancias del hook y el
 * resumen de 6 meses se vuelvan a consultar.
 *
 * El bug que tapa: escribir desde el `+` global mientras se ve el Dashboard.
 * La instancia global escribe, pero la lista/gráfica del Dashboard viven en
 * OTRAS instancias que no se enteran — a menos que la generación las despierte.
 * Sin ese bump quedaban viejas hasta navegar y volver, que es exactamente el
 * bug del saldo pero para las cifras del mes.
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

/** Sesión con un espía en la invalidación de transacciones. */
const conEspia = () => {
  const espia = vi.fn(() => {})
  const sesion = { ...sesionFalsa(), invalidarTxns: espia }
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

describe('useTransacciones incrementa la generación', () => {
  it('la carga inicial NO la incrementa', async () => {
    const { espia, envoltura } = conEspia()
    await montar(envoltura)
    expect(espia).not.toHaveBeenCalled()
  })

  it('agregar la incrementa', async () => {
    const { espia, envoltura } = conEspia()
    const result = await montar(envoltura)
    await result.current.addTxn({
      cuenta_id: 'c1', cantidad: -6500, descripcion: 'panal',
      categoria: 'Familia/Regalos', tipo: 'gasto',
    })
    expect(espia).toHaveBeenCalledTimes(1)
  })

  it('una transferencia la incrementa', async () => {
    const { espia, envoltura } = conEspia()
    const result = await montar(envoltura)
    await result.current.addTransferencia({
      deCuentaId: 'c1', aCuentaId: 'c2', cantidad: 50000,
      descripcion: 'Ahorro', fecha: '2026-09-21',
    })
    expect(espia).toHaveBeenCalledTimes(1)
  })

  it('borrar la incrementa', async () => {
    const { espia, envoltura } = conEspia()
    const result = await montar(envoltura)
    await result.current.deleteTxn('x1')
    expect(espia).toHaveBeenCalledTimes(1)
  })

  it('editar la incrementa', async () => {
    const { espia, envoltura } = conEspia()
    const result = await montar(envoltura)
    await result.current.updateTxn('x1', {
      cantidad: -9999, descripcion: 'comida', categoria: 'Otros', fecha: '2026-09-20',
    })
    expect(espia).toHaveBeenCalledTimes(1)
  })

  it('una escritura que FALLA no la incrementa', async () => {
    const { espia, envoltura } = conEspia()
    const result = await montar(envoltura)
    fallar = true
    const { error } = await result.current.addTxn({
      cuenta_id: 'c1', cantidad: -6500, descripcion: 'panal',
      categoria: 'Familia/Regalos', tipo: 'gasto',
    })
    expect(error).toBeTruthy()
    expect(espia).not.toHaveBeenCalled()
  })
})
