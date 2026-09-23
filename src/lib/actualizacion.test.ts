import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { crearAplicador } from './actualizacion'

/**
 * Cuándo se aplica una versión nueva de la PWA (= recargar la página). La
 * regla que importa: NUNCA con una hoja abierta, porque recargar tira lo que el
 * usuario estaba escribiendo.
 */
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('crearAplicador', () => {
  it('sin ninguna hoja abierta, aplica en el acto', () => {
    const aplicar = vi.fn()
    crearAplicador(aplicar, () => false)()
    expect(aplicar).toHaveBeenCalledTimes(1)
  })

  it('con una hoja abierta NO aplica, y aplica cuando se cierra', () => {
    const aplicar = vi.fn()
    let abierta = true
    crearAplicador(aplicar, () => abierta, 2000)()
    expect(aplicar).not.toHaveBeenCalled()

    vi.advanceTimersByTime(10_000)          // sigue abierta: nada
    expect(aplicar).not.toHaveBeenCalled()

    abierta = false                          // se guardó o se canceló
    vi.advanceTimersByTime(2000)
    expect(aplicar).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(20_000)           // y no vuelve a aplicar
    expect(aplicar).toHaveBeenCalledTimes(1)
  })

  it('si el aviso llega varias veces, aplica una sola', () => {
    const aplicar = vi.fn()
    const alHaberVersion = crearAplicador(aplicar, () => false)
    alHaberVersion()
    alHaberVersion()
    alHaberVersion()
    expect(aplicar).toHaveBeenCalledTimes(1)
  })

  it('avisos repetidos con una hoja abierta no apilan esperas', () => {
    const aplicar = vi.fn()
    let abierta = true
    const alHaberVersion = crearAplicador(aplicar, () => abierta, 2000)
    alHaberVersion()
    alHaberVersion()
    abierta = false
    vi.advanceTimersByTime(2000)
    expect(aplicar).toHaveBeenCalledTimes(1)
  })
})
