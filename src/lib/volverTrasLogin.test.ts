import { beforeEach, describe, expect, it } from 'vitest'
import { guardarDestino, tomarDestino } from './volverTrasLogin'

describe('volverTrasLogin', () => {
  beforeEach(() => sessionStorage.clear())

  it('devuelve la ruta guardada una sola vez', () => {
    guardarDestino('/oauth/consent?authorization_id=abc')
    expect(tomarDestino()).toBe('/oauth/consent?authorization_id=abc')
    expect(tomarDestino()).toBeNull()
  })

  it('no acepta destinos fuera de la app', () => {
    guardarDestino('https://malo.test/robar')
    guardarDestino('//malo.test')
    expect(tomarDestino()).toBeNull()
    sessionStorage.setItem('vorta.volverTrasLogin', '//malo.test')
    expect(tomarDestino()).toBeNull()
  })
})
