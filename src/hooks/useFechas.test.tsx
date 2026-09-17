import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { sesionFalsa } from '../test/sesionFalsa'
import { ConSesion } from '../test/ConSesion'
import { useFechas } from './useFechas'

/**
 * Lo que importa no es el formato — eso lo cubre `constants.test.ts` — sino que
 * la fecha salga de la zona del PERFIL y no de la del navegador. De acá salen
 * los límites de mes de todas las consultas.
 */

// 03:00 UTC del 5 = 21:00 del 4 en Guatemala y 12:00 del 5 en Tokio.
const INSTANTE_QUE_CRUZA = new Date('2026-04-05T03:00:00Z')

function Sonda() {
  const { hoy, mesActual, ahora, zona } = useFechas()
  return (
    <div>
      <p data-testid="hoy">{hoy()}</p>
      <p data-testid="mes">{mesActual()}</p>
      <p data-testid="dia">{String(ahora().getDate())}</p>
      <p data-testid="zona">{zona}</p>
    </div>
  )
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(INSTANTE_QUE_CRUZA) })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('useFechas', () => {
  it('el mismo instante da días distintos según la zona del perfil', () => {
    render(<ConSesion sesion={sesionFalsa({ zona_horaria: 'Asia/Tokyo' })}><Sonda /></ConSesion>)
    expect(screen.getByTestId('hoy')).toHaveTextContent('2026-04-05')
    expect(screen.getByTestId('zona')).toHaveTextContent('Asia/Tokyo')
    cleanup()

    render(<ConSesion sesion={sesionFalsa()}><Sonda /></ConSesion>)
    expect(screen.getByTestId('hoy')).toHaveTextContent('2026-04-04')
  })

  it('ahora() lee los campos de calendario de esa misma zona', () => {
    render(<ConSesion sesion={sesionFalsa()}><Sonda /></ConSesion>)
    expect(screen.getByTestId('dia')).toHaveTextContent('4')
    expect(screen.getByTestId('mes')).toHaveTextContent('2026-04')
  })

  it('no lanza con la zona del default: el provider ya rechazó las inválidas', () => {
    // `hoyEn()` sí lanza con una zona que no existe. Acá no puede llegar una:
    // el provider marca error en el slice y deja el perfil default.
    expect(() => render(<ConSesion sesion={sesionFalsa()}><Sonda /></ConSesion>)).not.toThrow()
  })
})
