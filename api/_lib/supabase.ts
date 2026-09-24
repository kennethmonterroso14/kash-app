/**
 * Clientes de Supabase para el servidor. Usan la clave PÚBLICA (anon), la misma
 * que el navegador — nunca la service role —, y el token de la persona: RLS
 * decide qué se ve y qué se escribe, igual que en la app.
 *
 * Leen las mismas variables que el build (`VITE_*`): en Vercel las variables
 * del proyecto llegan también a las funciones, así que no hay que duplicarlas.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function configSupabase(): { url: string; clave: string } {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const clave = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !clave) throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en el entorno de la función')
  return { url, clave }
}

const SIN_SESION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }

/** Cliente que actúa COMO la persona dueña del token. */
export function clienteDe(token: string): SupabaseClient {
  const { url, clave } = configSupabase()
  return createClient(url, clave, { auth: SIN_SESION, global: { headers: { Authorization: `Bearer ${token}` } } })
}

/**
 * El user id del token, o null. Pregunta al servidor de Auth (no solo verifica
 * la firma): así un acceso revocado desde Ajustes deja de servir enseguida.
 */
export async function usuarioDelToken(token: string): Promise<string | null> {
  const { url, clave } = configSupabase()
  const { data, error } = await createClient(url, clave, { auth: SIN_SESION }).auth.getUser(token)
  return error || !data.user ? null : data.user.id
}

/** Cliente sin sesión (rol anon): para el RPC del atajo, que autoriza por la clave. */
export function clienteAnonimo(): SupabaseClient {
  const { url, clave } = configSupabase()
  return createClient(url, clave, { auth: SIN_SESION })
}
