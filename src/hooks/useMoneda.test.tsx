import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { sesionFalsa } from '../test/sesionFalsa'
import { ConSesion } from '../test/ConSesion'
import { useMoneda } from './useMoneda'

/**
 * `useMoneda` es la currificación del perfil sobre `formatMoneda`, que es pura.
 * Lo que se prueba acá es eso: que el símbolo y los separadores salgan del
 * perfil y no de valores cableados.
 */

function Sonda() {
  const fmt = useMoneda()
  return (
    <div>
      <p data-testid="propia">{fmt(150000)}</p>
      <p data-testid="explicita">{fmt(150000, 'USD')}</p>
      <p data-testid="negativo">{fmt(-150000)}</p>
    </div>
  )
}

afterEach(() => cleanup())

describe('useMoneda', () => {
  it('usa la moneda y el locale del perfil, no GTQ cableado', () => {
    render(<ConSesion sesion={sesionFalsa({ moneda: 'USD', locale: 'en-US' })}><Sonda /></ConSesion>)
    expect(screen.getByTestId('propia')).toHaveTextContent('$1,500.00')
    expect(screen.getByTestId('negativo')).toHaveTextContent('-$1,500.00')
  })

  it('un perfil hondureño da lempiras sin tocar el código', () => {
    render(<ConSesion sesion={sesionFalsa({ moneda: 'HNL', locale: 'es-HN' })}><Sonda /></ConSesion>)
    expect(screen.getByTestId('propia')).toHaveTextContent('L1,500.00')
  })

  it('el default de Guatemala sigue dando lo de siempre', () => {
    render(<ConSesion sesion={sesionFalsa()}><Sonda /></ConSesion>)
    expect(screen.getByTestId('propia')).toHaveTextContent('Q1,500.00')
  })

  it('acepta una moneda explícita para montos guardados en otra moneda', () => {
    // Las filas USD de `inversiones` están en centavos de dólar, no en la
    // moneda del perfil. Antes eso se armaba a mano y perdía el separador
    // de miles.
    render(<ConSesion sesion={sesionFalsa()}><Sonda /></ConSesion>)
    expect(screen.getByTestId('explicita')).toHaveTextContent('$1,500.00')
  })

  it('si el perfil falló devuelve — en lugar de inventar el símbolo', () => {
    render(<ConSesion sesion={sesionFalsa({}, 'no se pudo leer el perfil')}><Sonda /></ConSesion>)
    expect(screen.getByTestId('propia')).toHaveTextContent('—')
    expect(screen.getByTestId('propia')).not.toHaveTextContent('Q')
  })
})
