import { describe, expect, it } from 'vitest'
import { generarClaveAtajo, hashClaveAtajo } from './claveAtajo'

describe('claveAtajo', () => {
  it('genera claves largas, distintas y seguras para una URL o un encabezado', () => {
    const a = generarClaveAtajo()
    const b = generarClaveAtajo()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^vorta_[A-Za-z0-9_-]{43}$/)
  })

  it('el hash es SHA-256 hex, igual que en /api/atajo y en Postgres', async () => {
    expect(await hashClaveAtajo('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(await hashClaveAtajo('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
