import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Interruptor from './Interruptor'

describe('Interruptor', () => {
  it('es un switch con su estado y avisa el valor nuevo', () => {
    const onCambiar = vi.fn()
    render(<Interruptor etiqueta="Permitir editar y borrar" activo={false} onCambiar={onCambiar} />)
    const sw = screen.getByRole('switch', { name: 'Permitir editar y borrar' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(sw)
    expect(onCambiar).toHaveBeenCalledWith(true)
  })

  it('deshabilitado no cambia', () => {
    const onCambiar = vi.fn()
    render(<Interruptor etiqueta="x" activo onCambiar={onCambiar} disabled />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onCambiar).not.toHaveBeenCalled()
  })
})
