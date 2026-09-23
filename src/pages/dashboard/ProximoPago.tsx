import { Link } from 'react-router-dom'
import type { ResumenTC, TarjetaCredito } from '../../lib/finanzas'
import { useMoneda } from '../../hooks/useMoneda'
import { IconoChevron, IconoTarjetas } from '../../components/iconos'

interface Props {
  tc: TarjetaCredito
  resumen: ResumenTC
}

/**
 * La fila "próximo pago": la tarjeta con deuda vencida cuyo pago está más cerca
 * (ver calcProximoPagoTC). Lleva a Tarjetas, que es donde se paga.
 */
export default function ProximoPago({ tc, resumen }: Props) {
  const fmt = useMoneda()
  const urgente = resumen.dias_para_pago <= 3
  const cuando = resumen.dias_para_pago === 0 ? 'hoy'
    : resumen.dias_para_pago === 1 ? 'mañana'
    : `en ${resumen.dias_para_pago} días`

  return (
    <Link to="/tarjetas" className="presionable vidrio-panel rounded-panel px-4 py-3 flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`grid place-items-center w-10 h-10 rounded-control shrink-0 ${urgente ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning'}`}
      >
        <IconoTarjetas size={22} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-text text-[15px] font-semibold truncate">{tc.nombre} · pagar {cuando}</span>
        <span className="block text-textDim text-[13px] tabular-nums">
          {fmt(tc.deuda_ciclo_anterior)} antes del día {tc.dia_pago}
        </span>
      </span>
      <IconoChevron direccion="der" size={18} className="text-textDim shrink-0" />
    </Link>
  )
}
