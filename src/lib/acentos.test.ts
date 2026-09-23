import { describe, it, expect } from 'vitest'
import { acentos, ACENTO_DEFAULT, temas } from './tokens'
import esquema from '../../supabase/schema.sql?raw'
import migracion from '../../supabase/migrations/20260923000000_profiles_acento.sql?raw'

const SQL = { 'schema.sql': esquema, 'migración acento': migracion }

// Contraste WCAG entre dos colores hex.
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contraste = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

describe('acentos', () => {
  it('son ocho, con ids únicos, e incluyen el default', () => {
    expect(acentos).toHaveLength(8)
    expect(new Set(acentos.map(a => a.id)).size).toBe(8)
    expect(acentos.some(a => a.id === ACENTO_DEFAULT)).toBe(true)
  })

  it('el default es exactamente el acento de los temas (sin elegir, nada cambia)', () => {
    const d = acentos.find(a => a.id === ACENTO_DEFAULT)!
    expect(d.oscuro).toEqual({ accent: temas.oscuro.colores.accent, accentAlt: temas.oscuro.colores.accentAlt })
    expect(d.claro).toEqual({ accent: temas.claro.colores.accent, accentAlt: temas.claro.colores.accentAlt })
  })

  // El acento es texto sobre el fondo (enlaces, "Ver todos") y fondo de los
  // botones con texto `bg` encima: el mismo par, así que una sola cuenta.
  it.each(acentos.map(a => [a.id, a]))('%s pasa AA (4.5:1) contra el fondo en los dos temas', (_id, a) => {
    expect(contraste(a.oscuro.accent, temas.oscuro.colores.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contraste(a.claro.accent, temas.claro.colores.bg)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('acentos ↔ base', () => {
  it('el check de profiles.acento acepta exactamente los ids del cliente', () => {
    // Si se agrega un acento acá y no en el check, guardarlo fallaría en la
    // base (y el selector diría "no se pudo guardar en tu cuenta").
    for (const [archivo, sql] of Object.entries(SQL)) {
      const lista = /check \(acento in \(([^)]*)\)\)/.exec(sql)?.[1]
      expect(lista, archivo).toBeDefined()
      const ids = lista!.split(',').map(x => x.trim().replace(/'/g, ''))
      expect(ids.sort(), archivo).toEqual(acentos.map(a => a.id).sort())
    }
  })
})
