import { describe, it, expect } from 'vitest'
import { descartaHoja, proyectar } from './movimiento'

/**
 * La regla del gesto de la hoja. Lo que se prueba no es la fórmula sino la
 * propiedad que hace que el arrastre se sienta bien: que un golpe corto y
 * rápido descarte, y que un arrastre lento y corto no.
 */

const ALTO = 500

describe('descartaHoja', () => {
  it('un golpe corto y rápido descarta', () => {
    // 60px de arrastre — apenas un 12% de la hoja — pero soltado a 1200px/s.
    // Sin la proyección de momento esto no llegaría al umbral y la hoja
    // volvería a su lugar, que es lo que se siente "pegajoso".
    expect(descartaHoja({ desplazamiento: 60, velocidad: 1200, alto: ALTO })).toBe(true)
  })

  it('un arrastre corto y lento NO descarta', () => {
    expect(descartaHoja({ desplazamiento: 60, velocidad: 50, alto: ALTO })).toBe(false)
  })

  it('un arrastre largo descarta aunque se suelte quieto', () => {
    expect(descartaHoja({ desplazamiento: 260, velocidad: 0, alto: ALTO })).toBe(true)
  })

  it('arrastrar hacia arriba nunca descarta', () => {
    expect(descartaHoja({ desplazamiento: -200, velocidad: -1500, alto: ALTO })).toBe(false)
  })

  it('el umbral es relativo al alto: la misma distancia decide distinto', () => {
    const gesto = { desplazamiento: 150, velocidad: 0 }
    expect(descartaHoja({ ...gesto, alto: 300 })).toBe(true)   // media hoja corta
    expect(descartaHoja({ ...gesto, alto: 800 })).toBe(false)  // un quinto de una larga
  })

  it('sin alto medido no descarta', () => {
    // Antes de medir preferimos no hacer nada: descartar por error es peor que
    // no reaccionar, porque el usuario pierde lo que estaba escribiendo.
    expect(descartaHoja({ desplazamiento: 999, velocidad: 9999, alto: 0 })).toBe(false)
  })
})

describe('proyectar', () => {
  it('crece con la velocidad y no al revés', () => {
    expect(proyectar(1000)).toBeGreaterThan(proyectar(500))
    expect(proyectar(-1000)).toBeLessThan(0)
    expect(proyectar(0)).toBe(0)
  })

  it('usa el decaimiento exponencial de Apple, no v²/2a', () => {
    // 1000px/s con 0.998 → (1000/1000)·0.998/0.002 = 499px. La fórmula de
    // manual daría otra cosa; este número es el que hace que un flick se
    // sienta como un flick.
    expect(proyectar(1000)).toBeCloseTo(499, 0)
  })
})
