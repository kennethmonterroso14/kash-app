import { describe, it, expect } from 'vitest'
import { estaDesactualizado, DIAS_PARA_DESACTUALIZAR } from './tipoCambio'

const AHORA = new Date('2026-09-20T12:00:00Z').getTime()
const haceDias = (n: number) => new Date(AHORA - n * 86_400_000).toISOString()

describe('estaDesactualizado', () => {
  it('sin fecha se considera desactualizado', () => {
    // Nunca se verificó: mostrar el default de Q7.75 como vigente sería
    // afirmar algo que no se sabe.
    expect(estaDesactualizado(null, AHORA)).toBe(true)
  })

  it('una fecha ilegible también', () => {
    expect(estaDesactualizado('no-es-una-fecha', AHORA)).toBe(true)
  })

  it('recién actualizado no lo está', () => {
    expect(estaDesactualizado(haceDias(0), AHORA)).toBe(false)
    expect(estaDesactualizado(haceDias(DIAS_PARA_DESACTUALIZAR - 1), AHORA)).toBe(false)
  })

  it('el umbral es inclusivo: a los 7 días ya cuenta', () => {
    expect(estaDesactualizado(haceDias(DIAS_PARA_DESACTUALIZAR), AHORA)).toBe(true)
    expect(estaDesactualizado(haceDias(30), AHORA)).toBe(true)
  })

  it('una fecha futura no se marca', () => {
    // Puede pasar por un reloj corrido; los días salen negativos y eso no es
    // "viejo".
    expect(estaDesactualizado(new Date(AHORA + 86_400_000).toISOString(), AHORA)).toBe(false)
  })
})
