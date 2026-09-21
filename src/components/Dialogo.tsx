import { useId, type ReactNode } from 'react'
import { useCerrarConEscape } from '../hooks/useCerrarConEscape'

interface Props {
  titulo: ReactNode
  onCerrar: () => void
  children: ReactNode
}

/**
 * Diálogo de confirmación: aparece en el centro, no desde abajo.
 *
 * Es un componente aparte de `Hoja` y no una prop de ella. Una hoja entra
 * desde abajo y un diálogo aparece en el centro: `apple-design` §7 pide que lo
 * que entra por un lado salga por el mismo, así que son dos animaciones con
 * orígenes distintos, y una prop `variante` las esconde.
 *
 * **No cierra con el scrim**, a diferencia de `Hoja`: un diálogo pide una
 * decisión y descartarlo por tocar al lado es demasiado fácil. Escape sí
 * cierra — en Apple equivale a "Cancelar", y sin él no hay salida por teclado.
 */
export default function Dialogo({ titulo, onCerrar, children }: Props) {
  const id = useId()
  useCerrarConEscape(onCerrar)

  return (
    <div className="fixed inset-0 scrim flex items-center justify-center z-50 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        className="vidrio-hoja rounded-tarjeta p-6 max-w-sm w-full max-h-[92dvh] overflow-y-auto overscroll-contain"
      >
        <h2 id={`${id}-titulo`} className="text-text font-semibold mb-2 tracking-titulo">{titulo}</h2>
        {children}
      </div>
    </div>
  )
}
