/**
 * El modo privado de los montos (el ojo de "Patrimonio total" en Resumen).
 *
 * **Arranca oculto**: abrir la app en el bus o en una reunión no debe mostrar
 * los saldos a quien esté al lado. Si la persona los muestra, quedan visibles
 * mientras la app siga abierta — navegar a Movimientos y volver no los vuelve a
 * tapar, que sería un tic molesto —, y la próxima vez que la abra arrancan
 * ocultos otra vez.
 *
 * Por eso va en sessionStorage y no en el estado de la página (que se reinicia
 * al volver a Resumen) ni en localStorage (que recordaría "visible" para
 * siempre y anularía el default).
 */
const CLAVE = 'vorta.montosVisibles'
const avisos = new Set<() => void>()
// Espejo en memoria: sin storage (modo privado de Safari, WebView restringido)
// el ojo tiene que seguir funcionando durante la sesión.
let visiblesEnMemoria = false

export function montosOcultos(): boolean {
  try {
    return sessionStorage.getItem(CLAVE) !== '1'
  } catch {
    return !visiblesEnMemoria
  }
}

export function alternarMontos(): void {
  const visibles = montosOcultos()   // estaban ocultos → pasan a visibles
  visiblesEnMemoria = visibles
  try {
    if (visibles) sessionStorage.setItem(CLAVE, '1')
    else sessionStorage.removeItem(CLAVE)
  } catch { /* queda el espejo en memoria */ }
  avisos.forEach(f => f())
}

export function suscribirMontos(f: () => void): () => void {
  avisos.add(f)
  return () => { avisos.delete(f) }
}
