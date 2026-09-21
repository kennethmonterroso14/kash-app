import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import Hoja from './Hoja'
import Dialogo from './Dialogo'

/**
 * Las salidas de la hoja, que es lo que se ganó al unificarla: el ✕ ya lo
 * tenían las catorce, el scrim también, y Escape ninguna.
 *
 * Y la diferencia deliberada entre las dos formas: la hoja se descarta tocando
 * al lado, el diálogo no, porque pide una decisión.
 */

afterEach(() => cleanup())

describe('Hoja', () => {
  it('cierra con el ✕', () => {
    const onCerrar = vi.fn()
    render(<Hoja titulo="Nueva cuenta" onCerrar={onCerrar}><p>contenido</p></Hoja>)
    fireEvent.click(screen.getByLabelText('Cerrar'))
    expect(onCerrar).toHaveBeenCalledTimes(1)
  })

  it('cierra tocando el scrim, y no tocando dentro', () => {
    const onCerrar = vi.fn()
    const { container } = render(
      <Hoja titulo="Nueva cuenta" onCerrar={onCerrar}><p>contenido</p></Hoja>,
    )
    fireEvent.click(screen.getByText('contenido'))
    expect(onCerrar).not.toHaveBeenCalled()
    // El scrim es el nodo externo; el handler compara target con currentTarget
    // justamente para que un clic que burbujea desde dentro no cierre.
    fireEvent.click(container.firstChild as HTMLElement)
    expect(onCerrar).toHaveBeenCalledTimes(1)
  })

  it('cierra con Escape', () => {
    const onCerrar = vi.fn()
    render(<Hoja titulo="Nueva cuenta" onCerrar={onCerrar}><p>contenido</p></Hoja>)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCerrar).toHaveBeenCalledTimes(1)
  })

  it('ignora otras teclas', () => {
    const onCerrar = vi.fn()
    render(<Hoja titulo="Nueva cuenta" onCerrar={onCerrar}><p>contenido</p></Hoja>)
    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'Esc' })
    expect(onCerrar).not.toHaveBeenCalled()
  })

  it('deja de escuchar Escape al desmontar', () => {
    const onCerrar = vi.fn()
    const { unmount } = render(
      <Hoja titulo="Nueva cuenta" onCerrar={onCerrar}><p>contenido</p></Hoja>,
    )
    unmount()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCerrar).not.toHaveBeenCalled()
  })

  it('con dos capas abiertas, Escape cierra solo la de encima', () => {
    const fuera = vi.fn()
    const dentro = vi.fn()
    render(
      <Hoja titulo="Nueva tarjeta" onCerrar={fuera}>
        <Dialogo titulo="¿Cerrar ciclo?" onCerrar={dentro}><p>seguro</p></Dialogo>
      </Hoja>,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dentro).toHaveBeenCalledTimes(1)
    expect(fuera).not.toHaveBeenCalled()
  })

  it('se anuncia como diálogo y toma su nombre del título', () => {
    render(<Hoja titulo="Nueva cuenta" onCerrar={vi.fn()}><p>contenido</p></Hoja>)
    // Ninguna de las catorce tenía role ni aria-modal: eran divs.
    const hoja = screen.getByRole('dialog')
    expect(hoja).toHaveAttribute('aria-modal', 'true')
    expect(hoja).toHaveAccessibleName('Nueva cuenta')
  })
})

describe('Dialogo', () => {
  it('NO cierra tocando el scrim', () => {
    const onCerrar = vi.fn()
    const { container } = render(
      <Dialogo titulo="¿Cerrar ciclo?" onCerrar={onCerrar}><p>seguro</p></Dialogo>,
    )
    fireEvent.click(container.firstChild as HTMLElement)
    expect(onCerrar).not.toHaveBeenCalled()
  })

  it('cierra con Escape, que es lo que equivale a Cancelar', () => {
    const onCerrar = vi.fn()
    render(<Dialogo titulo="¿Cerrar ciclo?" onCerrar={onCerrar}><p>seguro</p></Dialogo>)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCerrar).toHaveBeenCalledTimes(1)
  })

  it('se anuncia como diálogo y toma su nombre del título', () => {
    render(<Dialogo titulo="¿Cerrar ciclo?" onCerrar={vi.fn()}><p>seguro</p></Dialogo>)
    expect(screen.getByRole('dialog')).toHaveAccessibleName('¿Cerrar ciclo?')
  })
})
