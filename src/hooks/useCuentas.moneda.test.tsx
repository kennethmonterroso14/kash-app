import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useCuentas } from './useCuentas'

/**
 * La moneda de las cuentas: se leen TODAS (las archivadas también, porque sus
 * movimientos siguen en el historial y hay que saber en qué moneda están), la
 * lista que se muestra son las activas, y una base sin la columna no tumba las
 * cuentas.
 */

let sinColumna = false
let lecturas: string[] = []
let escrituras: unknown[] = []

const FILAS = [
  { id: 'q', nombre: 'BAC', tipo: 'corriente', saldo: 100_000, color: '#fff', activa: true, moneda: 'GTQ' },
  { id: 'd', nombre: 'BI Dólares', tipo: 'ahorro', saldo: 150_000, color: '#fff', activa: true, moneda: 'USD' },
  { id: 'v', nombre: 'Vieja USD', tipo: 'ahorro', saldo: 0, color: '#fff', activa: false, moneda: 'USD' },
]

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => {
      const q: Record<string, unknown> = {}
      let cols = ''
      let op = 'select'
      q.select = (c: string) => { cols = c; return q }
      q.eq = () => q
      q.order = () => q
      q.update = (p: unknown) => { op = 'update'; escrituras.push(p); return q }
      q.then = (fn: (r: unknown) => unknown) => {
        if (op === 'update') return Promise.resolve({ data: null, error: null }).then(fn)
        lecturas.push(cols)
        if (sinColumna && cols.includes('moneda')) {
          return Promise.resolve({ data: null, error: { message: 'column cuentas.moneda does not exist' } }).then(fn)
        }
        const data = FILAS.map(f => (cols.includes('moneda') ? f : { ...f, moneda: undefined }))
        return Promise.resolve({ data, error: null }).then(fn)
      }
      return q
    },
  },
}))

const montar = async () => {
  const { result } = renderHook(() => useCuentas('u1'))
  await waitFor(() => expect(result.current.loading).toBe(false))
  return result
}

afterEach(() => { cleanup(); sinColumna = false; lecturas = []; escrituras = [] })

describe('useCuentas con monedas', () => {
  it('muestra las activas, pero conoce la moneda de todas (también las archivadas)', async () => {
    const r = await montar()
    expect(r.current.cuentas.map(c => c.id)).toEqual(['q', 'd'])
    expect(r.current.monedas).toEqual({ q: 'GTQ', d: 'USD', v: 'USD' })
    expect(r.current.monedaDisponible).toBe(true)
  })

  it('sin la columna en la base relee sin ella: todo en quetzales y sin ofrecer moneda', async () => {
    sinColumna = true
    const r = await montar()
    expect(r.current.error).toBeNull()
    expect(r.current.cuentas.map(c => c.moneda)).toEqual(['GTQ', 'GTQ'])
    expect(r.current.monedaDisponible).toBe(false)
    expect(lecturas).toHaveLength(2)

    // Y una edición no manda la columna que no existe.
    await act(async () => { await r.current.actualizarCuenta('d', { nombre: 'x', tipo: 'ahorro', color: '#fff', moneda: 'USD' }) })
    expect(escrituras).toEqual([{ nombre: 'x', tipo: 'ahorro', color: '#fff' }])
  })

  it('cambiar la moneda la re-etiqueta sin tocar el saldo', async () => {
    const r = await montar()
    await act(async () => { await r.current.actualizarCuenta('q', { nombre: 'BAC', tipo: 'corriente', color: '#fff', moneda: 'USD' }) })
    expect(escrituras).toEqual([{ nombre: 'BAC', tipo: 'corriente', color: '#fff', moneda: 'USD' }])
    expect(r.current.cuentas.find(c => c.id === 'q')).toMatchObject({ moneda: 'USD', saldo: 100_000 })
    expect(r.current.monedas.q).toBe('USD')
  })
})
