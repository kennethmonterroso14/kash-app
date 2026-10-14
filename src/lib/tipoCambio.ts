/** Días sin actualizar tras los cuales el tipo de cambio se marca como viejo. */
export const DIAS_PARA_DESACTUALIZAR = 7

/**
 * `true` si el tipo de cambio guardado ya no es confiable.
 *
 * Sin fecha registrada devuelve `true`: nunca se verificó (o no se pudo leer el
 * perfil), y presentar el default de Q7.75 como si fuera el tipo vigente es la
 * clase de afirmación que el resto de la app evita.
 *
 * `ahora` se inyecta para que la función sea pura y testeable, y para que el
 * componente no lea el reloj en pleno render.
 */
export function estaDesactualizado(fechaISO: string | null, ahora: number): boolean {
  if (!fechaISO) return true
  const marca = new Date(fechaISO).getTime()
  // Una fecha ilegible se trata como no verificada, no como vigente.
  if (Number.isNaN(marca)) return true
  const dias = Math.floor((ahora - marca) / 86_400_000)
  return dias >= DIAS_PARA_DESACTUALIZAR
}
