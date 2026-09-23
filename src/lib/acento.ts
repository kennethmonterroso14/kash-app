import { acentos, ACENTO_DEFAULT } from './tokens'

/**
 * El acento activo: vive en `data-acento` de `<html>` (lo que las variables CSS
 * leen, ver el plugin de `tailwind.config.js`) y se recuerda en localStorage
 * para aplicarlo ANTES del primer render — si esperara al perfil, cada arranque
 * mostraría un destello morado.
 *
 * El perfil (`profiles.acento`) es lo que lo sincroniza entre dispositivos: el
 * provider lo aplica cuando carga, y Ajustes lo escribe. localStorage es solo el
 * recuerdo de este dispositivo.
 */
const CLAVE = 'vorta.acento'
const avisos = new Set<() => void>()

export const esAcentoValido = (id: unknown): id is string =>
  typeof id === 'string' && acentos.some(a => a.id === id)

function guardado(): string {
  try {
    const v = localStorage.getItem(CLAVE)
    return esAcentoValido(v) ? v : ACENTO_DEFAULT
  } catch {
    return ACENTO_DEFAULT   // modo privado o almacenamiento bloqueado
  }
}

/** Pone el acento en <html> y lo recuerda. Un id desconocido cae al default. */
export function aplicarAcento(id: string): void {
  const valido = esAcentoValido(id) ? id : ACENTO_DEFAULT
  if (typeof document !== 'undefined') document.documentElement.dataset.acento = valido
  try { localStorage.setItem(CLAVE, valido) } catch { /* sin almacenamiento: vale para esta sesión */ }
  avisos.forEach(f => f())
}

/** Al arrancar: el último acento de este dispositivo, sin esperar al perfil. */
export function iniciarAcento(): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.acento = guardado()
}

export const acentoActual = (): string =>
  (typeof document !== 'undefined' && esAcentoValido(document.documentElement.dataset.acento))
    ? document.documentElement.dataset.acento as string
    : ACENTO_DEFAULT

export function suscribirAcento(f: () => void): () => void {
  avisos.add(f)
  return () => { avisos.delete(f) }
}
