import { IconoMas } from './iconos'

/**
 * El botón redondo de "nuevo movimiento", alcanzable desde cualquier pantalla.
 * Antes el `+` vivía solo dentro de Movimientos.
 *
 * Solo el botón: la hoja la monta `Layout` a su nivel, FUERA de la barra
 * flotante. La barra es `pointer-events-none` (para dejar pasar los toques por
 * los huecos) y tiene `transform` (se encoge al scrollear); un `transform`
 * convierte a la barra en el bloque contenedor de cualquier `fixed` que cuelgue
 * de ella, así que si la hoja se montara acá quedaría encerrada en la barra y
 * sorda al tap del cierre.
 *
 * El FAB es un botón sólido de acento, sin `backdrop-filter`, así que lleva
 * `.presionable` directo.
 */
export default function BotonNuevoMovimiento({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Nuevo movimiento"
      className="presionable pointer-events-auto shrink-0 grid place-items-center w-[52px] h-[52px] rounded-full bg-accent text-bg shadow-flotante"
    >
      <IconoMas size={26} />
    </button>
  )
}
