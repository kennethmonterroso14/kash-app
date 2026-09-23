import BotonConfirmar from '../../components/BotonConfirmar'
import { IconoEditar } from '../../components/iconos'
import type { Transaccion } from '../../hooks/useTransacciones'
import { COLOR_CATEGORIA_FALLBACK, MESES } from '../../lib/constants'
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
 * "16 sep" en lugar de "2026-09-16". La lista está acotada a un mes y el header
 * ya dice cuál, así que repetir el año y el mes en cada fila era ruido — y a
 * 390px empujaba la línea a un segundo renglón o la truncaba justo en la fecha.
 *
 * Se parte el string, NO `new Date(fecha)`: eso lo interpreta como UTC y en
 * Guatemala (UTC-6) muestra el día anterior.
 */
const fechaCorta = (fecha: string): string => {
  const [, mes, dia] = fecha.split('-')
  return `${Number(dia)} ${MESES[Number(mes) - 1].slice(0, 3).toLowerCase()}`
}

export default function FilaTxn({ txn, color, editable, onEditar, onBorrar }: Props) {
  const fmt = useMoneda()

  return (
    <div className="vidrio-panel rounded-panel px-4 py-3 flex items-center gap-3">
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: color ?? COLOR_CATEGORIA_FALLBACK }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-text text-sm truncate">{txn.descripcion}</p>
        <p className="text-textDim text-xs tracking-micro truncate">{txn.categoria} · {fechaCorta(txn.fecha)}</p>
      </div>
      <span className={`tabular-nums text-sm font-semibold flex-shrink-0 ${txn.cantidad > 0 ? 'text-success' : 'text-danger'}`}>
        {txn.cantidad > 0 ? '+' : ''}{fmt(txn.cantidad)}
      </span>
      {editable && (
        <button
          type="button"
          onClick={onEditar}
          className="presionable text-xs px-2 py-1 rounded-chip text-textDim hover:text-accent flex-shrink-0"
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
  )
}
