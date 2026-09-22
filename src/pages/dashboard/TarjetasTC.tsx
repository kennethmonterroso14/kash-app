import type { ResumenTC, TarjetaCredito } from '../../lib/finanzas'
import { useMoneda } from '../../hooks/useMoneda'
import { IconoAlerta } from '../../components/iconos'

interface Props {
  resumenTCs: { tc: TarjetaCredito; resumen: ResumenTC }[]
}

/** Mini-tarjetas en scroll horizontal. */
export default function TarjetasTC({ resumenTCs }: Props) {
  const fmt = useMoneda()

  return (
    <div>
      <p className="text-textDim text-xs uppercase tracking-widest mb-2">Tarjetas de crédito</p>
      {/*
        touch-action: pan-y — el carril es horizontal, así que el navegador se
        queda con el eje vertical y un swipe diagonal no hace saltar la página
        (mobile-native §9).
      */}
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 touch-pan-y overscroll-x-contain">
        {resumenTCs.map(({ tc, resumen }) => (
          <div key={tc.id} className="bg-surface rounded-panel p-3 flex-shrink-0 w-44 space-y-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tc.color }} />
              <p className="text-text text-xs font-semibold truncate">{tc.nombre}</p>
            </div>
            <div>
              <p className="text-textDim text-xs tracking-micro">Disponible</p>
              <p className="tabular-nums text-sm text-text font-semibold">{fmt(resumen.disponible)}</p>
            </div>
            <div className="h-1 bg-bg rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  resumen.estado === 'critico' ? 'bg-danger'
                  : resumen.estado === 'alerta' ? 'bg-warning'
                  : 'bg-success'
                }`}
                style={{ width: `${Math.min(resumen.pct_uso, 100)}%` }}
              />
            </div>
            {tc.deuda_ciclo_anterior > 0 && (
              <p className="text-danger text-xs flex items-center gap-1">
                <IconoAlerta size={12} className="shrink-0" /> Pago pendiente
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
