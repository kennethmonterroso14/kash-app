/**
 * Cuándo aplicar una versión nueva de la app.
 *
 * La app es una PWA con service worker: el JS queda precacheado en el teléfono
 * y se sirve desde ahí aunque haya una versión nueva desplegada. Antes el
 * registro era el `registerSW.js` pelado —registra `/sw.js` y nada más—, así
 * que un arreglo desplegado NO llegaba a quien tenía la app instalada: el
 * `+` global siguió roto en el teléfono del dueño con el fix ya en producción.
 *
 * Aplicar una versión es recargar la página. Recargar con una hoja abierta
 * tira lo que se está escribiendo, y eso es peor que tardar un rato en
 * actualizar. Así que: si no hay ninguna hoja, se aplica ya; si hay una, se
 * espera a que se cierre (se guardó o se canceló) y recién ahí.
 *
 * Es una función pura sobre sus dos dependencias para poder probarla sin el
 * módulo virtual de vite-plugin-pwa, que en los tests no existe.
 */
export function crearAplicador(
  aplicar: () => void,
  hayHojaAbierta: () => boolean,
  intervaloMs = 2000,
) {
  let pendiente = false
  return () => {
    // El aviso de "hay versión nueva" puede llegar más de una vez (cada
    // chequeo lo repite); aplicar dos veces sería recargar dos veces.
    if (pendiente) return
    pendiente = true
    if (!hayHojaAbierta()) { aplicar(); return }
    const espera = setInterval(() => {
      if (hayHojaAbierta()) return
      clearInterval(espera)
      aplicar()
    }, intervaloMs)
  }
}

/** Hay una hoja o un diálogo abierto: `Hoja` y `Dialogo` son los dos `role="dialog"` de la app. */
export const hayHojaAbierta = () => document.querySelector('[role="dialog"]') !== null
