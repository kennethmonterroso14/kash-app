import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PagosPorCategorizar from './PagosPorCategorizar'
import { ConSesion } from '../test/ConSesion'
import { sesionFalsa } from '../test/sesionFalsa'

/**
 * El aviso de pagos de Apple Pay por categorizar: aparece solo si hay
 * pendientes, muestra la sugerida ya marcada, y guardar llama a
 * categorizar_pago con la elegida y pasa al siguiente.
 */

let filas: unknown[]
let rpcs: { fn: string; args: Record<string, unknown> }[]

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => {
      const q: Record<string, unknown> = {}
      const dev = () => q
      q.select = dev; q.eq = dev; q.order = dev
      q.then = (fn: (r: unknown) => unknown) => Promise.resolve({ data: filas, error: null }).then(fn)
      return q
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args })
      return Promise.resolve({ data: true, error: null })
    },
  },
}))

const pago = (id: string, descripcion: string, categoria: string) => ({
  transaccion_id: id,
  transacciones: { id, fecha: '2026-09-25', cantidad: -4500, descripcion, categoria, tipo: 'gasto', notas: 'Apple Pay · BAC Débito' },
})

const montar = () => render(
  <ConSesion sesion={{ ...sesionFalsa(), categoriasGasto: ['Supermercado', 'Comida/Restaurantes', 'Otros'] }}>
    <PagosPorCategorizar userId="u1" />
  </ConSesion>,
)

beforeEach(() => { rpcs = [] })
afterEach(cleanup)

describe('PagosPorCategorizar', () => {
  it('sin pendientes no muestra nada', async () => {
    filas = []
    const { container } = montar()
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('con pendientes avisa, abre la hoja con la sugerida marcada y guarda la elegida', async () => {
    filas = [pago('t1', 'Walmart', 'Supermercado'), pago('t2', 'Uber', 'Otros')]
    montar()
    fireEvent.click(await screen.findByRole('button', { name: /2 pagos de Apple Pay por categorizar/ }))

    expect(screen.getByText('Walmart')).toBeInTheDocument()
    expect(screen.getByText(/BAC Débito · 25 sep/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Supermercado' })).toBeChecked()

    fireEvent.click(screen.getByRole('radio', { name: 'Comida/Restaurantes' }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar · Comida\/Restaurantes/ }))

    await waitFor(() => expect(rpcs).toEqual([
      { fn: 'categorizar_pago', args: { p_transaccion_id: 't1', p_categoria: 'Comida/Restaurantes' } },
    ]))
    // Pasa al siguiente, con SU sugerida.
    expect(await screen.findByText('Uber')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Otros' })).toBeChecked()
  })
})
