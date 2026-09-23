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
      <p className="text-text text-xl font-bold tracking-titulo mb-3 px-1">Tarjetas de crédito</p>
      {/*
        touch-action: pan-y — el carril es horizontal, así que el navegador se
        queda con el eje vertical y un swipe diagonal no hace saltar la página
        (mobile-native §9).
      */}
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 touch-pan-y overscroll-x-contain">
        {resumenTCs.map(({ tc, resumen }) => (
          // La misma cara de tarjeta que en Tarjetas, en chico: el color del
          // usuario con un velo oscuro para que el texto blanco siempre lea.
          <div
            key={tc.id}
            className="relative overflow-hidden rounded-panel p-3 flex-shrink-0 w-44 aspect-[1.6] flex flex-col justify-between text-white shadow-chip"
            style={{ background: `linear-gradient(135deg, ${tc.color}, color-mix(in srgb, ${tc.color} 45%, #0b0b12))` }}
          >
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/35" />
            <p className="relative text-[13px] font-semibold truncate">{tc.nombre}</p>
            <div className="relative space-y-1.5">
              <div>
                <p className="text-white/75 text-[11px]">Disponible</p>
                <p className="tabular-nums text-[15px] font-semibold">{fmt(resumen.disponible)}</p>
              </div>
              <div className="h-1 bg-white/25 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    resumen.estado === 'critico' ? 'bg-danger'
                    : resumen.estado === 'alerta' ? 'bg-warning'
                    : 'bg-white'
                  }`}
                  style={{ width: `${Math.min(resumen.pct_uso, 100)}%` }}
                />
              </div>
              {tc.deuda_ciclo_anterior > 0 && (
                <p className="text-[11px] font-semibold flex items-center gap-1">
                  <IconoAlerta size={12} className="shrink-0" /> Pago pendiente
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
