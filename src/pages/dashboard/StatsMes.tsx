import type { EstadisticasMes } from '../../lib/finanzas'
import { useMoneda } from '../../hooks/useMoneda'

/** Meta mínima de ahorro, en % del ingreso del mes. */
const META_AHORRO = 25

interface Props {
  stats: EstadisticasMes
}

export default function StatsMes({ stats }: Props) {
  const fmt = useMoneda()
  const llegaALaMeta = stats.pctAhorro >= META_AHORRO

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface rounded-tarjeta p-4">
          <p className="text-textDim text-xs mb-1 tracking-micro">Ingresos</p>
          <p className="text-success font-mono font-semibold text-sm">{fmt(stats.ingresos)}</p>
        </div>
        <div className="bg-surface rounded-tarjeta p-4">
          <p className="text-textDim text-xs mb-1 tracking-micro">Gastos</p>
          <p className="text-danger font-mono font-semibold text-sm">{fmt(stats.gastos)}</p>
        </div>
        <div className="bg-surface rounded-tarjeta p-4">
          <p className="text-textDim text-xs mb-1 tracking-micro">Neto</p>
          <p className={`font-mono font-semibold text-sm ${stats.neto >= 0 ? 'text-success' : 'text-danger'}`}>
            {fmt(stats.neto)}
          </p>
        </div>
      </div>

      {/* Sin ingresos el porcentaje de ahorro no significa nada. */}
      {stats.ingresos > 0 && (
        <div className="bg-surface rounded-tarjeta p-4">
          <div className="flex justify-between mb-2">
            <span className="text-textDim text-sm">Tasa de ahorro</span>
            <span className={`font-mono font-semibold text-sm ${llegaALaMeta ? 'text-success' : 'text-danger'}`}>
              {stats.pctAhorro}%
            </span>
          </div>
          <div aria-hidden="true" className="h-2 bg-bg rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-normal ease-salida ${llegaALaMeta ? 'bg-success' : 'bg-danger'}`}
              style={{ width: `${Math.min(stats.pctAhorro, 100)}%` }}
            />
          </div>
          {!llegaALaMeta && (
            <p className="text-danger text-xs mt-2">Meta mínima: {META_AHORRO}% de ahorro</p>
          )}
        </div>
      )}
    </>
  )
}
