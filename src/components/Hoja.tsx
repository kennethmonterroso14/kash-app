import { useId, type ReactNode } from 'react'
import { useCerrarConEscape } from '../hooks/useCerrarConEscape'

interface Props {
  titulo: ReactNode
  onCerrar: () => void
  children: ReactNode
}

/**
 * Hoja modal: entra desde abajo, ocupa el ancho en móvil y se limita a
 * `max-w-lg` centrada en pantallas anchas.
 *
 * Reemplaza las cinco variantes del mismo contenedor que había en catorce
 * archivos (`p-5` vs `p-6`, con y sin `max-w-lg`, con y sin scroll). Las
 * diferencias no las decidió nadie, así que acá hay una sola forma:
 *
 * - `p-6` con el bottom compensado por el área segura — la hoja llega al borde
 *   inferior de la pantalla, y sin esa compensación el último botón queda bajo
 *   el indicador de home.
 * - `max-h-[92dvh]` + scroll con `overscroll-contain` siempre, no solo en las
 *   hojas que hoy son largas: cualquiera lo es con el teclado abierto.
 *   `dvh` y no `vh` porque la barra de Safari cambia de alto.
 * - `space-y-4` entre el encabezado y el contenido. Al migrar las hojas que
 *   usaban `mb-*` en cada hijo hay que quitarlos, o el espacio se suma.
 * - El título va `truncate` y el ✕ `shrink-0`: tres hojas ya lo pedían porque
 *   el título lleva el nombre de la cuenta o la tarjeta, y las otras dejaban
 *   que un nombre largo empujara el ✕ fuera de la hoja.
 *
 * Cierra con el ✕, con el scrim y con Escape. Se cierra con el scrim porque
 * una hoja es descartable; un `Dialogo` de confirmación no (ver ahí).
 *
 * Sin movimiento todavía: cuando llegue, va acá y en `Dialogo`, y son dos
 * animaciones distintas porque son dos orígenes distintos.
 */
export default function Hoja({ titulo, onCerrar, children }: Props) {
  const id = useId()
  useCerrarConEscape(onCerrar)

  return (
    <div
      className="fixed inset-0 scrim flex items-end justify-center z-50"
      onClick={e => { if (e.target === e.currentTarget) onCerrar() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        className="vidrio-hoja w-full max-w-lg rounded-t-hoja p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] space-y-4 max-h-[92dvh] overflow-y-auto overscroll-contain"
      >
        <div className="flex justify-between items-center gap-3">
          <h2 id={`${id}-titulo`} className="text-text font-semibold tracking-titulo truncate">{titulo}</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="presionable text-textDim text-xl shrink-0">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
