import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import Hoja from './Hoja'
import Dialogo from './Dialogo'

/**
 * Las salidas de la hoja, que es lo que se ganó al unificarla: el ✕ ya lo
 * tenían las catorce, el scrim también, y Escape ninguna.
 *
 * Y la diferencia deliberada entre las dos formas: la hoja se descarta tocando
 * al lado, el diálogo no, porque pide una decisión.
 *
 * `onCerrar` llega DESPUÉS de la animación de salida, no al tocar: la hoja
 * decide cuándo el padre la desmonta, que es lo que le permite animar su propia
 * salida. De ahí los `waitFor` — con `skipAnimations` en el setup la salida
 * termina en el acto, pero sigue siendo un tick después del evento.
 */

/** El scrim es su propia capa desde que la opacidad la escribe el arrastre. */
const scrim = (c: HTMLElement) => c.querySelector('.scrim') as HTMLElement

afterEach(() => cleanup())

describe('Hoja', () => {
  it('cierra con el ✕', async () => {
    const onCerrar = vi.fn()
    render(<Hoja titulo="Nueva cuenta" onCerrar={onCerrar}><p>contenido</p></Hoja>)
    fireEvent.click(screen.getByLabelText('Cerrar'))
    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1))
  })

  it('cierra tocando el scrim, y no tocando dentro', async () => {
    const onCerrar = vi.fn()
    const { container } = render(
      <Hoja titulo="Nueva cuenta" onCerrar={onCerrar}><p>contenido</p></Hoja>,
    )
    // La hoja es hermana del scrim, no su hija: un clic dentro no burbujea
    // por el scrim, así que no hace falta comparar target con currentTarget.
    fireEvent.click(screen.getByText('contenido'))
    expect(onCerrar).not.toHaveBeenCalled()
    fireEvent.click(scrim(container))
    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1))
  })

  it('cierra con Escape', async () => {
    const onCerrar = vi.fn()
    render(<Hoja titulo="Nueva cuenta" onCerrar={onCerrar}><p>contenido</p></Hoja>)
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1))
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

  it('con dos capas abiertas, Escape cierra solo la de encima', async () => {
    const fuera = vi.fn()
    const dentro = vi.fn()
    render(
      <Hoja titulo="Nueva tarjeta" onCerrar={fuera}>
        <Dialogo titulo="¿Cerrar ciclo?" onCerrar={dentro}><p>seguro</p></Dialogo>
      </Hoja>,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(dentro).toHaveBeenCalledTimes(1))
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
    fireEvent.click(scrim(container))
    expect(onCerrar).not.toHaveBeenCalled()
  })

  it('cierra con Escape, que es lo que equivale a Cancelar', async () => {
    const onCerrar = vi.fn()
    render(<Dialogo titulo="¿Cerrar ciclo?" onCerrar={onCerrar}><p>seguro</p></Dialogo>)
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1))
  })

  it('se anuncia como diálogo y toma su nombre del título', () => {
    render(<Dialogo titulo="¿Cerrar ciclo?" onCerrar={vi.fn()}><p>seguro</p></Dialogo>)
    expect(screen.getByRole('dialog')).toHaveAccessibleName('¿Cerrar ciclo?')
  })
})
