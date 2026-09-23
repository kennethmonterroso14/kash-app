import type { ReactNode } from 'react'

interface Props {
  /** Qué falta, afirmado: "Sin cuentas aún". */
  titulo: ReactNode
  /** Qué hacer al respecto, en una línea. */
  pista?: ReactNode
  /** Emoji o glifo grande sobre el título. */
  icono?: ReactNode
  /** El botón de la acción que llena el vacío. */
  children?: ReactNode
}

/**
 * El estado vacío de una lista: una tarjeta con el mismo peso que las filas que
 * reemplaza.
 *
 * Había ocho, en cinco formas distintas: `rounded-tarjeta` o `rounded-panel`,
 * con tarjeta o suelto en `py-16`, con el título en `text-text font-medium` o
 * en `text-textDim`. Dos (Inversiones y Categorías) no tenían tarjeta y
 * quedaban flotando sobre el fondo, que a ojo se lee como que la página no
 * cargó en lugar de como que no hay nada.
 *
 * Lo que este componente NO es: un fallo de consulta. "No hay datos" y "no se
 * pudo cargar" son afirmaciones distintas, y presentar la segunda como la
 * primera fue toda una clase de bug acá. Las páginas siguen guardando el
 * `!error &&` que decide cuál de las dos mostrar; esto solo dibuja la primera.
 */
export default function EstadoVacio({ titulo, pista, icono, children }: Props) {
  return (
    <div className="vidrio-panel rounded-tarjeta p-8 text-center space-y-3">
      {icono && <p aria-hidden="true" className="text-3xl">{icono}</p>}
      <p className="text-text font-medium">{titulo}</p>
      {pista && <p className="text-textDim text-sm">{pista}</p>}
      {children}
    </div>
  )
}
