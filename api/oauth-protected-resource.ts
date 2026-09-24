/**
 * Metadata del recurso protegido (RFC 9728): le dice al cliente MCP que el
 * servidor de autorización es Supabase Auth. `vercel.json` sirve esto en
 * `/.well-known/oauth-protected-resource` y `…/api/mcp`, las dos rutas donde los
 * clientes la buscan.
 */
import { configSupabase } from './_lib/supabase.js'

export function GET(request: Request): Response {
  const origen = new URL(request.url).origin
  const { url } = configSupabase()
  return new Response(JSON.stringify({
    resource: `${origen}/api/mcp`,
    authorization_servers: [`${url}/auth/v1`],
    bearer_methods_supported: ['header'],
    resource_name: 'Vorta',
    resource_documentation: `${origen}/ajustes/asistentes`,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
