import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import BotonConfirmar from './BotonConfirmar'

/**
 * Las tres propiedades por las que existe el primitivo: que un toque no
 * ejecute nada, que el segundo sí, y que el temporizador muera con el
 * componente. Lo tercero es lo que ninguno de los nueve sitios hacía.
 */

beforeEach(() => vi.useFakeTimers())
afterEach(() => { cleanup(); vi.useRealTimers() })

const sonda = (onConfirmar: () => void) => render(
  <BotonConfirmar accion="Eliminar Netflix" etiqueta="×" onConfirmar={onConfirmar} />,
)

describe('BotonConfirmar', () => {
  it('el primer toque arma y no ejecuta', () => {
    const onConfirmar = vi.fn()
    sonda(onConfirmar)
    fireEvent.click(screen.getByRole('button'))
    expect(onConfirmar).not.toHaveBeenCalled()
    expect(screen.getByRole('button')).toHaveTextContent('Confirmar')
  })

  it('el segundo toque ejecuta, una sola vez', () => {
    const onConfirmar = vi.fn()
    sonda(onConfirmar)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByRole('button'))
    expect(onConfirmar).toHaveBeenCalledTimes(1)
    // Y vuelve a reposo: un tercer toque tiene que volver a armar, no repetir.
    expect(screen.getByRole('button')).toHaveTextContent('×')
    fireEvent.click(screen.getByRole('button'))
    expect(onConfirmar).toHaveBeenCalledTimes(1)
  })

  it('se rinde solo a los 3s y el toque siguiente vuelve a armar', () => {
    const onConfirmar = vi.fn()
    sonda(onConfirmar)
    fireEvent.click(screen.getByRole('button'))
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.getByRole('button')).toHaveTextContent('×')
    // El toque que llega tarde arma en vez de ejecutar: es la propiedad que
    // impide que un borrado ocurra por un toque suelto minutos después.
    fireEvent.click(screen.getByRole('button'))
    expect(onConfirmar).not.toHaveBeenCalled()
  })

  it('sigue armado justo antes de los 3s', () => {
    const onConfirmar = vi.fn()
    sonda(onConfirmar)
    fireEvent.click(screen.getByRole('button'))
    act(() => { vi.advanceTimersByTime(2999) })
    fireEvent.click(screen.getByRole('button'))
    expect(onConfirmar).toHaveBeenCalledTimes(1)
  })

  it('limpia el temporizador al desmontar', () => {
    const onConfirmar = vi.fn()
    const { unmount } = sonda(onConfirmar)
    fireEvent.click(screen.getByRole('button'))
    unmount()
    // Sin el clearTimeout del efecto el temporizador sigue en la cola. Se
    // cuenta, no se espera un warning: en React 18 un setState sobre un
    // componente desmontado es un no-op silencioso y no avisa de nada.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('nombra la fila en el aria-label armado', () => {
    sonda(vi.fn())
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Eliminar Netflix')
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Confirmar: Eliminar Netflix')
  })

  it('deshabilitado no arma', () => {
    const onConfirmar = vi.fn()
    render(<BotonConfirmar accion="Eliminar Netflix" etiqueta="×" disabled onConfirmar={onConfirmar} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toHaveTextContent('×')
    expect(onConfirmar).not.toHaveBeenCalled()
  })
})
