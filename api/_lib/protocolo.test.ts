// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { manejarMcp, type Dependencias } from './protocolo.js'
import { ErrorHerramienta } from './validacion.js'
import type { Herramienta } from './herramientas.js'
import type { SupabaseClient } from '@supabase/supabase-js'

const eco: Herramienta = {
  nombre: 'eco', titulo: 'Eco', descripcion: 'Devuelve lo que recibe', soloLectura: true,
  esquema: { type: 'object', properties: {} },
  async ejecutar(ctx, args) {
    if (args.fallar === 'usuario') throw new ErrorHerramienta('monto: debe ser mayor que 0')
    if (args.fallar === 'bug') throw new Error('secreto de postgres')
    return { userId: ctx.userId, args }
  },
}

function deps(): Dependencias & { validarToken: ReturnType<typeof vi.fn> } {
  return {
    validarToken: vi.fn(async (t: string) => (t === 'bueno' ? 'u1' : null)),
    crearContexto: (_t, userId) => ({ db: {} as SupabaseClient, userId }),
    herramientas: [eco],
  }
}

const post = (cuerpo: unknown, token: string | null = 'bueno') => new Request('https://vorta.test/api/mcp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
  body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
})

describe('autorización', () => {
  it('sin token: 401 con el desafío que apunta a la metadata', async () => {
    const d = deps()
    const r = await manejarMcp(post({ jsonrpc: '2.0', id: 1, method: 'initialize' }, null), d)
    expect(r.status).toBe(401)
    expect(r.headers.get('WWW-Authenticate'))
      .toBe('Bearer resource_metadata="https://vorta.test/.well-known/oauth-protected-resource/api/mcp"')
    expect(d.validarToken).not.toHaveBeenCalled()
  })
  it('token inválido: 401 invalid_token', async () => {
    const r = await manejarMcp(post({ jsonrpc: '2.0', id: 1, method: 'ping' }, 'malo'), deps())
    expect(r.status).toBe(401)
    expect(r.headers.get('WWW-Authenticate')).toMatch(/error="invalid_token"/)
  })
  it('OPTIONS es el preflight de CORS, sin token', async () => {
    const r = await manejarMcp(new Request('https://vorta.test/api/mcp', { method: 'OPTIONS' }), deps())
    expect(r.status).toBe(204)
    expect(r.headers.get('Access-Control-Allow-Headers')).toMatch(/Authorization/)
  })
  it('GET: 405, no hay stream de servidor', async () => {
    const r = await manejarMcp(new Request('https://vorta.test/api/mcp'), deps())
    expect(r.status).toBe(405)
  })
})

describe('JSON-RPC', () => {
  it('initialize negocia la versión y anuncia herramientas', async () => {
    const r = await manejarMcp(post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }), deps())
    const { result } = await r.json()
    expect(result.protocolVersion).toBe('2025-06-18')
    expect(result.capabilities).toEqual({ tools: { listChanged: false } })
    expect(result.serverInfo.name).toBe('vorta')
  })
  it('una versión desconocida recibe la más nueva', async () => {
    const r = await manejarMcp(post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } }), deps())
    expect((await r.json()).result.protocolVersion).toBe('2025-11-25')
  })
  it('una notificación se acepta con 202 y sin cuerpo', async () => {
    const r = await manejarMcp(post({ jsonrpc: '2.0', method: 'notifications/initialized' }), deps())
    expect(r.status).toBe(202)
    expect(await r.text()).toBe('')
  })
  it('tools/list expone nombre, esquema y si solo lee', async () => {
    const r = await manejarMcp(post({ jsonrpc: '2.0', id: 2, method: 'tools/list' }), deps())
    const { result } = await r.json()
    expect(result.tools[0]).toMatchObject({ name: 'eco', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } })
  })
  it('tools/call corre con el usuario del token', async () => {
    const r = await manejarMcp(post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'eco', arguments: { a: 1 } } }), deps())
    const { result } = await r.json()
    expect(JSON.parse(result.content[0].text)).toEqual({ userId: 'u1', args: { a: 1 } })
    expect(result.isError).toBeUndefined()
  })
  it('un error corregible vuelve como resultado con isError, para que el modelo reintente', async () => {
    const r = await manejarMcp(post({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'eco', arguments: { fallar: 'usuario' } } }), deps())
    const { result } = await r.json()
    expect(result).toEqual({ content: [{ type: 'text', text: 'monto: debe ser mayor que 0' }], isError: true })
  })
  it('un error inesperado no filtra su mensaje', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await manejarMcp(post({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'eco', arguments: { fallar: 'bug' } } }), deps())
    const { result } = await r.json()
    expect(result.isError).toBe(true)
    expect(result.content[0].text).not.toMatch(/postgres/)
  })
  it('herramienta o método desconocidos son errores de protocolo', async () => {
    const d = deps()
    const a = await (await manejarMcp(post({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'nada' } }), d)).json()
    expect(a.error.code).toBe(-32602)
    const b = await (await manejarMcp(post({ jsonrpc: '2.0', id: 7, method: 'resources/list' }), d)).json()
    expect(b.error.code).toBe(-32601)
  })
  it('JSON roto: 400 parse error', async () => {
    const r = await manejarMcp(post('{no es json'), deps())
    expect(r.status).toBe(400)
    expect((await r.json()).error.code).toBe(-32700)
  })
  it('un lote contesta un arreglo, sin las notificaciones', async () => {
    const r = await manejarMcp(post([
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 8, method: 'ping' },
    ]), deps())
    expect(await r.json()).toEqual([{ jsonrpc: '2.0', id: 8, result: {} }])
  })
})
