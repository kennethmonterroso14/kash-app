import { describe, it, expect, beforeEach, vi } from 'vitest'
import { aplicarAcento, iniciarAcento, acentoActual, suscribirAcento, esAcentoValido } from './acento'

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.acento
})

describe('acento', () => {
  it('aplicar pone data-acento en <html>, lo recuerda y avisa', () => {
    const aviso = vi.fn()
    const quitar = suscribirAcento(aviso)
    aplicarAcento('azul')
    expect(document.documentElement.dataset.acento).toBe('azul')
    expect(localStorage.getItem('vorta.acento')).toBe('azul')
    expect(acentoActual()).toBe('azul')
    expect(aviso).toHaveBeenCalledTimes(1)
    quitar()
    aplicarAcento('rosa')
    expect(aviso).toHaveBeenCalledTimes(1)
  })

  it('un id desconocido cae al default en lugar de dejar un atributo sin estilos', () => {
    aplicarAcento('fucsia')
    expect(document.documentElement.dataset.acento).toBe('morado')
  })

  it('iniciar usa lo recordado en este dispositivo, o el default', () => {
    iniciarAcento()
    expect(acentoActual()).toBe('morado')
    localStorage.setItem('vorta.acento', 'menta')
    iniciarAcento()
    expect(acentoActual()).toBe('menta')
    localStorage.setItem('vorta.acento', 'cualquier-cosa')
    iniciarAcento()
    expect(acentoActual()).toBe('morado')
  })

  it('valida ids', () => {
    expect(esAcentoValido('grafito')).toBe(true)
    expect(esAcentoValido('x')).toBe(false)
    expect(esAcentoValido(null)).toBe(false)
  })
})
