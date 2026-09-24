/**
 * La clave del atajo de Apple Pay (docs/APPLE_PAY.md).
 *
 * Se genera EN EL NAVEGADOR y nunca viaja a la base: solo su SHA-256 (hex).
 * Se muestra una sola vez para copiarla al atajo. /api/atajo calcula el mismo
 * hash con node:crypto y Postgres lo compara; los tres tienen que coincidir
 * byte a byte, y por eso los tests fijan vectores conocidos.
 */

/** 256 bits aleatorios en base64url, con prefijo para reconocerla si se pega mal. */
export function generarClaveAtajo(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `vorta_${b64}`
}

export async function hashClaveAtajo(clave: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clave))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}
