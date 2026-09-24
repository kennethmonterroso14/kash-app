/**
 * Adónde volver después de iniciar sesión, cuando el login saca a la persona de
 * la app. Hoy el único caso es el consentimiento OAuth: la IA la manda a
 * `/oauth/consent?authorization_id=…`, y si entra con Google, Google devuelve
 * al ORIGEN (es la URL que está autorizada en Supabase), no a esa ruta.
 *
 * Va en sessionStorage: sobrevive a la vuelta de Google en la misma pestaña y
 * muere con ella. Solo se aceptan rutas internas, para que nadie pueda usar
 * esto para mandar a la persona a otro sitio después del login.
 */
const CLAVE = 'vorta.volverTrasLogin'

const esRutaInterna = (ruta: string) => ruta.startsWith('/') && !ruta.startsWith('//')

export function guardarDestino(ruta: string): void {
  if (!esRutaInterna(ruta)) return
  try { sessionStorage.setItem(CLAVE, ruta) } catch { /* sin storage: se vuelve al inicio */ }
}

/** Lo lee y lo borra: se usa una sola vez. */
export function tomarDestino(): string | null {
  try {
    const ruta = sessionStorage.getItem(CLAVE)
    sessionStorage.removeItem(CLAVE)
    return ruta && esRutaInterna(ruta) ? ruta : null
  } catch {
    return null
  }
}
