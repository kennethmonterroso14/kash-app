import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'
import { sesionFalsa } from '../test/sesionFalsa'
import { ConSesion } from '../test/ConSesion'
import { useTransacciones } from './useTransacciones'

/**
 * Tarea 1.5.5 — carreras de cambio de mes.
 *
 * El defecto que esto tapa: el usuario cambia de mes, la respuesta del mes
 * ANTERIOR llega después, y la lista queda mostrando movimientos de agosto bajo
 * el encabezado de septiembre. Con cifras de dinero eso no es un parpadeo
 * cosmético — es una afirmación falsa sobre cuánto se gastó.
 *
 * Se prueba con respuestas que resuelven fuera de orden a propósito.
 */

/** Resolver pendiente por mes, para responder en el orden que el test quiera. */
let pendientes: { desde: string; resolver: (filas: unknown[]) => void }[] = []

vi.mock('../lib/supabase', () => {
  const hacer = () => {
    let desde = ''
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.order = () => q
    q.eq = () => q
    q.lte = () => q
    q.gte = (_col: string, val: string) => { desde = val; return q }
    q.then = (fn: (r: unknown) => unknown) => new Promise<unknown>(res => {
      pendientes.push({ desde, resolver: filas => res({ data: filas, error: null }) })
    }).then(fn)
    return q
  }
  return { supabase: { from: () => hacer() } }
})

const fila = (id: string, fecha: string) => ({
  id, cuenta_id: 'c1', fecha, cantidad: -1000, descripcion: id,
  categoria: 'Otros', tipo: 'gasto',
})

const envoltura = ({ children }: { children: ReactNode }) => (
  <ConSesion sesion={sesionFalsa()}>{children}</ConSesion>
)

/** Espera a que exista la consulta de ese mes (el efecto es asíncrono). */
const esperarConsulta = async (mes: string) => {
  await waitFor(() => expect(pendientes.some(x => x.desde === `${mes}-01`)).toBe(true))
}

/**
 * Responde la consulta pendiente de ese mes y la saca de la lista, para que una
 * segunda llamada no vuelva a resolver la misma promesa.
 */
const responder = async (mes: string, filas: unknown[]) => {
  await esperarConsulta(mes)
  const i = pendientes.findIndex(x => x.desde === `${mes}-01`)
  const [p] = pendientes.splice(i, 1)
  await act(async () => { p.resolver(filas) })
}

beforeEach(() => { pendientes = [] })
afterEach(() => cleanup())

describe('useTransacciones — carreras de cambio de mes', () => {
  it('una respuesta lenta del mes anterior NO se pinta bajo el mes nuevo', async () => {
    const { result, rerender } = renderHook(
      ({ mes }) => useTransacciones('u1', mes),
      { wrapper: envoltura, initialProps: { mes: '2026-08' } },
    )
    await esperarConsulta('2026-08')

    // El usuario cambia a septiembre ANTES de que agosto responda.
    rerender({ mes: '2026-09' })
    await esperarConsulta('2026-09')

    // Ahora agosto responde, tarde.
    await responder('2026-08', [fila('agosto-1', '2026-08-15')])
    expect(result.current.txns).toHaveLength(0)

    // Y cuando responde septiembre, se pintan las suyas.
    await responder('2026-09', [fila('sept-1', '2026-09-10')])
    await waitFor(() => expect(result.current.txns).toHaveLength(1))
    expect(result.current.txns[0].id).toBe('sept-1')
  })

  it('volver al mes anterior no reusa las filas del otro mes mientras carga', async () => {
    const { result, rerender } = renderHook(
      ({ mes }) => useTransacciones('u1', mes),
      { wrapper: envoltura, initialProps: { mes: '2026-09' } },
    )
    await esperarConsulta('2026-09')
    await responder('2026-09', [fila('sept-1', '2026-09-10'), fila('sept-2', '2026-09-11')])
    await waitFor(() => expect(result.current.txns).toHaveLength(2))

    // Al pasar a agosto, la lista se vacía en el mismo render: las filas de
    // septiembre bajo el encabezado de agosto serían una cifra equivocada.
    rerender({ mes: '2026-08' })
    expect(result.current.txns).toHaveLength(0)

    await responder('2026-08', [fila('agosto-1', '2026-08-03')])
    await waitFor(() => expect(result.current.txns).toHaveLength(1))
    expect(result.current.txns[0].id).toBe('agosto-1')
  })

  it('la ventana de la consulta cubre el mes completo, con el último día real', async () => {
    // Febrero de un año no bisiesto: si el último día se calculara como 30 o
    // 31, la consulta pediría fechas que no existen.
    const { rerender } = renderHook(
      ({ mes }) => useTransacciones('u1', mes),
      { wrapper: envoltura, initialProps: { mes: '2026-02' } },
    )
    await esperarConsulta('2026-02')
    rerender({ mes: '2026-04' })
    await esperarConsulta('2026-04')
    expect(pendientes.map(x => x.desde)).toEqual(['2026-02-01', '2026-04-01'])
  })

  it('tres cambios rápidos: solo pinta el último mes pedido', async () => {
    const { result, rerender } = renderHook(
      ({ mes }) => useTransacciones('u1', mes),
      { wrapper: envoltura, initialProps: { mes: '2026-07' } },
    )
    await esperarConsulta('2026-07')
    rerender({ mes: '2026-08' })
    await esperarConsulta('2026-08')
    rerender({ mes: '2026-09' })
    await esperarConsulta('2026-09')

    // Las tres responden al revés del orden en que se pidieron.
    await responder('2026-09', [fila('sept-1', '2026-09-10')])
    await responder('2026-08', [fila('agosto-1', '2026-08-10')])
    await responder('2026-07', [fila('julio-1', '2026-07-10')])

    await waitFor(() => expect(result.current.txns).toHaveLength(1))
    expect(result.current.txns[0].id).toBe('sept-1')
  })
})
