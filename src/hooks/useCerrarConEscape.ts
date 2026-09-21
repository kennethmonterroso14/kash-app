import { useEffect } from 'react'

/**
 * Escape cierra la capa de encima. Ninguna de las catorce hojas lo tenía: se
 * salía solo tocando el ✕ o el scrim, que en un teclado físico (y en el iPad
 * con teclado) deja la hoja sin salida.
 *
 * El listener va en `keydown` de `window` con captura y `stopPropagation`, para
 * que dos capas abiertas a la vez cierren solo la de encima: la última en
 * montarse es la última en suscribirse, y en fase de captura sobre el mismo
 * nodo los listeners corren en orden de registro.
 */
export function useCerrarConEscape(onCerrar: () => void) {
  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onCerrar()
    }
    window.addEventListener('keydown', alPresionar, true)
    return () => window.removeEventListener('keydown', alPresionar, true)
  }, [onCerrar])
}
