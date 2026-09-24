/**
 * El protocolo MCP sobre HTTP (Streamable HTTP), en su forma más chica: sin
 * estado, sin sesiones y sin SSE — cada POST trae un mensaje JSON-RPC y se
 * contesta con JSON. Alcanza porque el servidor solo expone herramientas.
 *
 * Es una función de `Request` a `Response` con las dependencias inyectadas, así
 * que se prueba entera sin red: el handler de Vercel (`api/mcp.ts`) solo le
 * pasa el cliente real de Supabase.
 */
import { ErrorHerramienta } from './validacion.js'
import type { Contexto, Herramienta } from './herramientas.js'

export interface Dependencias {
  /** El user id dueño del token, o null si el token no sirve (inválido, vencido, revocado). */
  validarToken(token: string): Promise<string | null>
  crearContexto(token: string, userId: string): Contexto
  herramientas: Herramienta[]
}

/** Versiones que este servidor habla; ante una desconocida se contesta la más nueva. */
const VERSIONES = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

const INSTRUCCIONES =
  'Vorta es la app de finanzas personales de esta persona. Llama primero a obtener_contexto para conocer sus ' +
  'cuentas, categorías, moneda y la fecha de hoy. Para cargar un estado de cuenta: registrar_movimientos con ' +
  'todas las filas y luego fijar_saldo_cuenta con el saldo final del estado si no cuadra. Antes de escribir, ' +
  'confirma con la persona qué vas a registrar. Editar y borrar solo funcionan si la persona los activó en ' +
  'Vorta → Ajustes → Asistentes de IA; confirma siempre antes de borrar.'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
}

/** Donde el cliente MCP encuentra quién autoriza (RFC 9728). */
export const urlMetadata = (origen: string) => `${origen}/.well-known/oauth-protected-resource/api/mcp`

const json = (cuerpo: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra } })

interface Mensaje { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

const errorRpc = (id: Mensaje['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

export async function manejarMcp(request: Request, deps: Dependencias): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  // Sin stream de servidor a cliente: el spec pide 405 para el GET en ese caso.
  if (request.method !== 'POST') return json(errorRpc(null, -32000, 'Usa POST'), 405, { Allow: 'POST, OPTIONS' })

  // Todo pide token, también `initialize`: el 401 es lo que dispara el OAuth en el cliente.
  const origen = new URL(request.url).origin
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]?.trim()
  const desafio = (extra = '') => ({ 'WWW-Authenticate': `Bearer resource_metadata="${urlMetadata(origen)}"${extra}` })
  if (!token) return json(errorRpc(null, -32001, 'Falta autorización'), 401, desafio())
  const userId = await deps.validarToken(token)
  if (!userId) {
    return json(errorRpc(null, -32001, 'Token inválido o vencido'), 401, desafio(', error="invalid_token"'))
  }

  let cuerpo: unknown
  try {
    cuerpo = await request.json()
  } catch {
    return json(errorRpc(null, -32700, 'JSON inválido'), 400)
  }

  const ctx = deps.crearContexto(token, userId)
  const lote = Array.isArray(cuerpo)
  const mensajes = (lote ? cuerpo : [cuerpo]) as Mensaje[]
  const respuestas = []
  for (const m of mensajes) {
    const r = await atender(m, ctx, deps.herramientas)
    if (r) respuestas.push(r)
  }
  // Solo notificaciones o respuestas del cliente: se aceptan sin cuerpo.
  if (respuestas.length === 0) return new Response(null, { status: 202, headers: CORS })
  return json(lote ? respuestas : respuestas[0])
}

async function atender(m: Mensaje, ctx: Contexto, herramientas: Herramienta[]) {
  if (typeof m !== 'object' || m === null || typeof m.method !== 'string') return null
  // Sin id es una notificación (`notifications/initialized`, …): no se contesta.
  if (m.id === undefined || m.id === null) return null
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result })

  switch (m.method) {
    case 'initialize': {
      const pedida = m.params?.protocolVersion
      return ok({
        protocolVersion: typeof pedida === 'string' && VERSIONES.includes(pedida) ? pedida : VERSIONES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'vorta', title: 'Vorta', version: '1.0.0' },
        instructions: INSTRUCCIONES,
      })
    }
    case 'ping':
      return ok({})
    case 'tools/list':
      return ok({
        tools: herramientas.map(h => ({
          name: h.nombre,
          title: h.titulo,
          description: h.descripcion,
          inputSchema: h.esquema,
          annotations: {
            title: h.titulo,
            readOnlyHint: h.soloLectura,
            destructiveHint: h.destructiva ?? false,
            idempotentHint: h.soloLectura,
            openWorldHint: false,
          },
        })),
      })
    case 'tools/call': {
      const nombre = m.params?.name
      const h = herramientas.find(x => x.nombre === nombre)
      if (!h) return errorRpc(m.id, -32602, `Herramienta desconocida: ${String(nombre)}`)
      const args = m.params?.arguments
      try {
        const resultado = await h.ejecutar(ctx, typeof args === 'object' && args !== null ? args as Record<string, unknown> : {})
        return ok({ content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] })
      } catch (e) {
        // Un error de la herramienta es un RESULTADO con isError, no un error
        // de protocolo: así el modelo lo lee y puede corregir y reintentar.
        if (e instanceof ErrorHerramienta) return ok({ content: [{ type: 'text', text: e.message }], isError: true })
        console.error(`[mcp] ${h.nombre} falló:`, e)
        return ok({ content: [{ type: 'text', text: 'Error inesperado en Vorta. Intenta de nuevo en un momento.' }], isError: true })
      }
    }
    default:
      return errorRpc(m.id, -32601, `Método no soportado: ${m.method}`)
  }
}
