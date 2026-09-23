import { describe, it, expect, vi } from 'vitest'
import { googleActivado, leerErrorOAuth, mensajeErrorOAuth } from './authOAuth'

describe('leerErrorOAuth', () => {
  it('lee el error del hash (flujo implícito)', () => {
    expect(leerErrorOAuth('https://app.test/#error=access_denied&error_description=The+user+denied'))
      .toEqual({ codigo: 'access_denied', detalle: 'The user denied' })
  })

  it('lee el error de la query (PKCE)', () => {
    expect(leerErrorOAuth('https://app.test/?error=server_error&error_description=Algo%20fall%C3%B3'))
      .toEqual({ codigo: 'server_error', detalle: 'Algo falló' })
  })

  it('acepta error_code cuando no hay error', () => {
    expect(leerErrorOAuth('https://app.test/#error_code=bad_oauth_state'))
      .toEqual({ codigo: 'bad_oauth_state', detalle: '' })
  })

  it('una vuelta exitosa (tokens en el hash) no es un error', () => {
    expect(leerErrorOAuth('https://app.test/#access_token=abc&refresh_token=def')).toBeNull()
    expect(leerErrorOAuth('https://app.test/resumen')).toBeNull()
  })
})

describe('mensajeErrorOAuth', () => {
  it('distingue cancelar, proveedor apagado y el resto', () => {
    expect(mensajeErrorOAuth({ codigo: 'access_denied', detalle: '' })).toMatch(/Cancelaste/)
    expect(mensajeErrorOAuth({ codigo: 'validation_failed', detalle: 'Unsupported provider: provider is not enabled' }))
      .toMatch(/no está activado/)
    expect(mensajeErrorOAuth({ codigo: 'server_error', detalle: 'boom' })).toBe('No se pudo entrar con Google. Intenta de nuevo.')
  })
})

describe('googleActivado', () => {
  const respuesta = (cuerpo: unknown, ok = true) =>
    vi.fn().mockResolvedValue({ ok, json: async () => cuerpo }) as unknown as typeof fetch

  it('true solo si external.google es true, y consulta con la clave pública', async () => {
    const f = respuesta({ external: { google: true, email: true } })
    expect(await googleActivado('https://x.supabase.co', 'clave', f)).toBe(true)
    expect(f).toHaveBeenCalledWith('https://x.supabase.co/auth/v1/settings', { headers: { apikey: 'clave' } })
    expect(await googleActivado('u', 'k', respuesta({ external: { google: false } }))).toBe(false)
    expect(await googleActivado('u', 'k', respuesta({}))).toBe(false)
  })

  it('una respuesta de error o una falla de red cuentan como apagado', async () => {
    expect(await googleActivado('u', 'k', respuesta({ external: { google: true } }, false))).toBe(false)
    const falla = vi.fn().mockRejectedValue(new Error('red')) as unknown as typeof fetch
    expect(await googleActivado('u', 'k', falla)).toBe(false)
  })
})
