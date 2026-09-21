import { useEffect } from 'react'

/**
 * Escape cierra la capa de encima. Ninguna de las catorce hojas lo tenía: se
 * salía solo tocando el ✕ o el scrim, que en un teclado físico (y en el iPad
 * con teclado) deja la hoja sin salida.
 *
 * Con dos capas abiertas a la vez, cierra solo la de encima. Los efectos corren
 * de hijo a padre, así que la capa interna se suscribe primero, y sobre el mismo
 * nodo los listeners corren en orden de registro: la interna ve el evento antes.
 *
 * Para frenar ahí hace falta `stopImmediatePropagation` y no `stopPropagation`:
 * el segundo detiene la propagación hacia *otros* nodos, no a los demás
 * listeners del mismo nodo, que es el caso acá porque todos están en `window`.
 * Con `stopPropagation` las dos capas se cerraban de un solo Escape — lo
 * descubrió el test, no la lectura del código.
 */
export function useCerrarConEscape(onCerrar: () => void) {
  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      onCerrar()
    }
    window.addEventListener('keydown', alPresionar, true)
    return () => window.removeEventListener('keydown', alPresionar, true)
  }, [onCerrar])
}
