import BotonConfirmar from '../../components/BotonConfirmar'
import { IconoEditar, IconoCheck } from '../../components/iconos'
import type { PagoRecurrente } from '../../hooks/usePagosRecurrentes'
import { useMoneda } from '../../hooks/useMoneda'

export type EstadoPago = 'aplicado' | 'pendiente' | 'proximo'

interface Props {
  pago: PagoRecurrente
  estado: EstadoPago
  nombreCuenta: string
  onEditar: () => void
  onBorrar: () => void
}

export default function FilaPago({
  pago: p, estado, nombreCuenta, onEditar, onBorrar,
}: Props) {
  const fmt = useMoneda()

  return (
    <div className="bg-surface rounded-tarjeta p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-text text-sm font-medium">{p.nombre}</span>
            {estado === 'aplicado' && (
              <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded-full whitespace-nowrap inline-flex items-center gap-1"><IconoCheck size={12} /> aplicado</span>
            )}
            {estado === 'pendiente' && (
              <span className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded-full whitespace-nowrap">pendiente</span>
            )}
          </div>
          <p className="text-textDim text-xs mt-1 tracking-micro">
            Día {p.dia_del_mes} · {p.categoria} · {nombreCuenta}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-danger font-mono text-sm font-semibold">-{fmt(p.monto)}</span>
          <button
            onClick={onEditar}
            aria-label={`Editar ${p.nombre}`}
            className="presionable text-xs px-2 py-1 rounded-chip text-textDim hover:text-accent"
          >
            <IconoEditar size={15} />
          </button>
          <BotonConfirmar
            accion={`Eliminar ${p.nombre}`}
            etiqueta="×"
            onConfirmar={onBorrar}
          />
        </div>
      </div>
    </div>
  )
}
