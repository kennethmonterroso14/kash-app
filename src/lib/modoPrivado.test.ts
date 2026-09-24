import { beforeEach, describe, expect, it, vi } from 'vitest'
import { alternarMontos, montosOcultos, suscribirMontos } from './modoPrivado'

describe('modoPrivado', () => {
  beforeEach(() => sessionStorage.clear())

  it('arranca oculto', () => {
    expect(montosOcultos()).toBe(true)
  })

  it('mostrar dura la sesión (sobrevive a volver a Resumen) y avisa', () => {
    const aviso = vi.fn()
    const quitar = suscribirMontos(aviso)
    alternarMontos()
    expect(montosOcultos()).toBe(false)
    expect(aviso).toHaveBeenCalledTimes(1)
    alternarMontos()
    expect(montosOcultos()).toBe(true)
    quitar()
  })

  it('una sesión nueva vuelve a arrancar oculta', () => {
    alternarMontos()
    sessionStorage.clear()   // lo que pasa al cerrar y abrir la app
    expect(montosOcultos()).toBe(true)
  })
})
