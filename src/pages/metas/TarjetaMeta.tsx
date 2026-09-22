import BotonConfirmar from '../../components/BotonConfirmar'
import { calcTiempoParaMeta } from '../../lib/finanzas'
import { useMoneda } from '../../hooks/useMoneda'
import { useSesion } from '../../context/sesion'
import type { Meta } from '../../hooks/useMetas'

interface Props {
  meta: Meta
  /** Ahorro mensual estimado, en centavos. 0 = sin dato. */
  ahorroMensual: number
  operando: boolean
  onCompletar: () => void
  onBorrar: () => void
}

export default function TarjetaMeta({
  meta, ahorroMensual, operando, onCompletar, onBorrar,
}: Props) {
  const fmt = useMoneda()
  const { perfil } = useSesion()

  const pct = meta.monto_objetivo > 0
    ? Math.min(100, Math.round((meta.monto_actual / meta.monto_objetivo) * 100))
    : 0

  const estimado = (() => {
    if (ahorroMensual <= 0) return 'Ingresa un ahorro mensual'
    try {
      const { meses, fecha } = calcTiempoParaMeta(meta.monto_objetivo, ahorroMensual, meta.monto_actual)
      if (meses === 0) return 'Meta alcanzada'
      // El locale sale del perfil, no cableado a es-GT.
      const texto = fecha.toLocaleDateString(perfil.locale, { month: 'short', year: 'numeric' })
      return `~${meses} ${meses === 1 ? 'mes' : 'meses'} · Meta: ${texto}`
    } catch {
      return 'Ingresa un ahorro mensual válido'
    }
  })()

  return (
    <div className="bg-surface rounded-tarjeta px-4 py-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-text font-medium min-w-0 truncate">{meta.nombre}</p>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={onCompletar}
            disabled={operando}
            className="presionable text-xs px-2 py-1 rounded-chip text-accent border border-accent/40 hover:bg-accent hover:text-bg disabled:opacity-50"
          >
            Completar
          </button>
          <BotonConfirmar
            accion={`Eliminar meta ${meta.nombre}`}
            etiqueta="×"
            disabled={operando}
            onConfirmar={onBorrar}
          />
        </div>
      </div>

      <div aria-hidden="true" className="w-full bg-bg rounded-full h-2">
        <div className="bg-success h-2 rounded-full transition-all duration-normal ease-salida" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-success tabular-nums text-sm">
          {fmt(meta.monto_actual)}
          <span className="text-textDim"> / {fmt(meta.monto_objetivo)}</span>
        </span>
        <span className="text-textDim text-xs" aria-label={`${pct}% de la meta`}>{pct}%</span>
      </div>

      <p className="text-textDim text-xs tracking-micro">{estimado}</p>
    </div>
  )
}
