import AvatarCategoria from '../../components/AvatarCategoria'
import BotonConfirmar from '../../components/BotonConfirmar'
import { IconoEditar } from '../../components/iconos'
import type { Transaccion } from '../../hooks/useTransacciones'
import { useMoneda } from '../../hooks/useMoneda'

interface Props {
  txn: Transaccion
  color?: string
  /** Un movimiento de TC no se puede editar; se corrige borrando y re-registrando. */
  editable: boolean
  onEditar: () => void
  onBorrar: () => void
}

/**
 * Una fila de la lista agrupada por día: avatar de la categoría, descripción,
 * categoría y monto, más editar y borrar. Es un `<li>` sin fondo propio: el
 * vidrio lo pone el grupo del día, como en Wallet. La fecha no se repite — la
 * dice el encabezado del grupo.
 */
export default function FilaTxn({ txn, color, editable, onEditar, onBorrar }: Props) {
  const fmt = useMoneda()

  return (
    <li className="flex items-center gap-3 min-h-[60px] py-2 border-t border-perimetro first:border-t-0">
      <AvatarCategoria categoria={txn.categoria} color={color} />
      <div className="flex-1 min-w-0">
        <p className="text-text text-[16px] truncate">{txn.descripcion}</p>
        <p className="text-textDim text-[13px] truncate">{txn.categoria}</p>
      </div>
      <span className={`tabular-nums text-[16px] font-semibold flex-shrink-0 ${txn.cantidad > 0 ? 'text-success' : 'text-text'}`}>
        {txn.cantidad > 0 ? '+' : ''}{fmt(txn.cantidad)}
      </span>
      <div className="flex items-center -mr-2 flex-shrink-0">
        {editable && (
          <button
            type="button"
            onClick={onEditar}
            className="presionable grid place-items-center w-8 h-8 rounded-full text-textDim hover:text-accent"
            aria-label={`Editar ${txn.descripcion}`}
          >
            <IconoEditar size={15} />
          </button>
        )}
        <BotonConfirmar
          accion={`Eliminar ${txn.descripcion}`}
          etiqueta="×"
          onConfirmar={onBorrar}
        />
      </div>
    </li>
  )
}
