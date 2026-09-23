/**
 * Lo que vuelve de un inicio de sesión con Google cuando NO sale bien.
 *
 * Supabase redirige de vuelta a la app con el error en la URL — en el hash
 * (`#error=access_denied&error_description=...`) con el flujo implícito, o en
 * la query con PKCE — y ningún evento de `onAuthStateChange` lo anuncia. Sin
 * leerlo, el usuario cancelaba en Google y volvía a un login mudo.
 */
export function leerErrorOAuth(url: string): { codigo: string; detalle: string } | null {
  const u = new URL(url)
  const params = [u.searchParams, new URLSearchParams(u.hash.replace(/^#/, ''))]
  for (const p of params) {
    const codigo = p.get('error') ?? p.get('error_code')
    if (codigo) return { codigo, detalle: p.get('error_description') ?? '' }
  }
  return null
}

/** El error de OAuth, en español y sin el texto crudo del proveedor. */
export function mensajeErrorOAuth({ codigo, detalle }: { codigo: string; detalle: string }): string {
  if (codigo === 'access_denied') return 'Cancelaste el inicio de sesión con Google.'
  if (/provider is not enabled/i.test(detalle)) return 'El inicio con Google todavía no está activado.'
  return 'No se pudo entrar con Google. Intenta de nuevo.'
}

/**
 * ¿El proveedor Google está activado en el proyecto de Supabase? Lo dice el
 * endpoint público `/auth/v1/settings` (`external.google`).
 *
 * El botón se muestra solo si responde que sí: con el proveedor apagado,
 * `signInWithOAuth` igual redirige, y el usuario terminaba en una página de
 * Supabase con un JSON de error y sin forma de volver. Ante cualquier fallo de
 * la consulta se asume que no, por lo mismo.
 */
export async function googleActivado(url: string, clave: string, f: typeof fetch = fetch): Promise<boolean> {
  try {
    const r = await f(`${url}/auth/v1/settings`, { headers: { apikey: clave } })
    if (!r.ok) return false
    const datos = await r.json() as { external?: Record<string, boolean> }
    return datos.external?.google === true
  } catch {
    return false
  }
}
