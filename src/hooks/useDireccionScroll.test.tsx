import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useDireccionScroll } from './useDireccionScroll'

/**
 * La lógica de dirección de la barra flotante: baja → compacta, sube → entera,
 * y cerca del tope siempre entera. rAF se hace síncrono para el test.
 */
const irA = (y: number) => act(() => {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true })
  window.dispatchEvent(new Event('scroll'))
})

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('useDireccionScroll', () => {
  it('arranca sin bajar', () => {
    const { result } = renderHook(() => useDireccionScroll())
    expect(result.current).toBe(false)
  })

  it('bajar lo pone en true', () => {
    const { result } = renderHook(() => useDireccionScroll())
    irA(240)
    expect(result.current).toBe(true)
  })

  it('subir lo devuelve a false', () => {
    const { result } = renderHook(() => useDireccionScroll())
    irA(240)
    expect(result.current).toBe(true)
    irA(140)
    expect(result.current).toBe(false)
  })

  it('cerca del tope siempre es false, aunque la última dirección fuera bajar', () => {
    const { result } = renderHook(() => useDireccionScroll())
    irA(240)
    expect(result.current).toBe(true)
    irA(8)
    expect(result.current).toBe(false)
  })

  it('ignora micro-movimientos bajo el umbral', () => {
    const { result } = renderHook(() => useDireccionScroll(8))
    irA(200)          // baja: true
    expect(result.current).toBe(true)
    irA(196)          // 4px arriba, bajo el umbral: no cambia
    expect(result.current).toBe(true)
  })
})
