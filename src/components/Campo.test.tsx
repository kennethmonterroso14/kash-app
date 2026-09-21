import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Campo from './Campo'

/**
 * Lo único que hay que probar de `Campo` es la razón por la que existe: que la
 * etiqueta y el control queden asociados sin que el sitio de llamada haga nada.
 * `getByLabelText` falla si el `htmlFor` no apunta al `id` del control, que es
 * exactamente el defecto que había en veintidós sitios.
 */

afterEach(() => cleanup())

describe('Campo', () => {
  it('asocia la etiqueta con el input', () => {
    render(<Campo etiqueta="Monto (Q)" />)
    const input = screen.getByLabelText('Monto (Q)')
    expect(input.tagName).toBe('INPUT')
    // Explícito además de getByLabelText: la asociación es el htmlFor, y esto
    // falla también si algún día el componente la hiciera envolviendo el input
    // (que funciona, pero deja el control sin nombre accesible en Safari viejo).
    expect(screen.getByText('Monto (Q)')).toHaveAttribute('for', input.id)
  })

  it('asocia la etiqueta con el select y con el textarea', () => {
    render(
      <>
        <Campo etiqueta="Categoría" tipo="select"><option value="a">A</option></Campo>
        <Campo etiqueta="Notas" tipo="area" />
      </>,
    )
    expect(screen.getByLabelText('Categoría').tagName).toBe('SELECT')
    expect(screen.getByLabelText('Notas').tagName).toBe('TEXTAREA')
  })

  it('da un id distinto a cada instancia', () => {
    render(
      <>
        <Campo etiqueta="Fecha de inicio" tipo="date" />
        <Campo etiqueta="Fecha del update" tipo="date" />
      </>,
    )
    // Dos hojas montadas a la vez compartían el id fijo `inv-fecha` y la
    // etiqueta de la segunda apuntaba al control de la primera.
    const a = screen.getByLabelText('Fecha de inicio')
    const b = screen.getByLabelText('Fecha del update')
    expect(a.id).not.toBe(b.id)
    expect(a.id).toBeTruthy()
  })

  it('pasa las props del control y no las del campo', () => {
    render(<Campo etiqueta="Últimos 4" inputMode="numeric" maxLength={4} clase="font-mono" />)
    const input = screen.getByLabelText('Últimos 4')
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).toHaveAttribute('maxlength', '4')
    expect(input).toHaveClass('font-mono')
    // `etiqueta`, `clase` y `pista` son del campo: no deben llegar al DOM.
    expect(input).not.toHaveAttribute('etiqueta')
    expect(input).not.toHaveAttribute('clase')
  })

  it('no renderiza el atributo tipo como atributo del select', () => {
    render(<Campo etiqueta="Tipo" tipo="select"><option value="a">A</option></Campo>)
    expect(screen.getByLabelText('Tipo')).not.toHaveAttribute('tipo')
  })
})
