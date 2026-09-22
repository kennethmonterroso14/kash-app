import { useState } from 'react'
import { useEscribirTxn } from '../hooks/useEscribirTxn'
import ModalNuevoMovimiento from '../pages/transacciones/ModalNuevoMovimiento'
import { IconoMas } from './iconos'

/**
 * El botón redondo de "nuevo movimiento", alcanzable desde CUALQUIER pantalla.
 * Antes el `+` vivía solo dentro de Movimientos.
 *
 * Escribe con `useEscribirTxn` (no `useTransacciones`): el `+` puede estar sobre
 * el Dashboard, Presupuesto o donde sea, y no tiene una lista propia que
 * actualizar. La invalidación por generación (dentro de `useEscribirTxn`) hace
 * que la lista/gráfica que SÍ están en pantalla se vuelvan a consultar.
 *
 * El FAB es un botón sólido de acento, sin `backdrop-filter`, así que lleva
 * `.presionable` directo. La hoja (`Hoja`, `fixed inset-0 z-50`) queda por
 * encima de la cápsula sin tocar z-index.
 */
export default function BotonNuevoMovimiento({ userId }: { userId: string }) {
  const [abierto, setAbierto] = useState(false)
  const { addTxn, addTransferencia } = useEscribirTxn(userId)

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Nuevo movimiento"
        className="presionable pointer-events-auto shrink-0 grid place-items-center w-[52px] h-[52px] rounded-full bg-accent text-bg shadow-flotante"
      >
        <IconoMas size={26} />
      </button>
      {abierto && (
        <ModalNuevoMovimiento
          agregar={addTxn}
          agregarTransferencia={addTransferencia}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </>
  )
}
