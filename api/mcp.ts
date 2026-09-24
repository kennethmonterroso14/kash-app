/**
 * El conector MCP de Vorta: la URL que la persona pega en su IA.
 * La lógica vive en `_lib/` (los archivos con `_` no son rutas en Vercel).
 */
import { HERRAMIENTAS } from './_lib/herramientas.js'
import { manejarMcp, type Dependencias } from './_lib/protocolo.js'
import { clienteDe, usuarioDelToken } from './_lib/supabase.js'

const deps: Dependencias = {
  validarToken: usuarioDelToken,
  crearContexto: (token, userId) => ({ db: clienteDe(token), userId }),
  herramientas: HERRAMIENTAS,
}

const manejar = (request: Request) => manejarMcp(request, deps)

export { manejar as GET, manejar as POST, manejar as OPTIONS, manejar as DELETE }
