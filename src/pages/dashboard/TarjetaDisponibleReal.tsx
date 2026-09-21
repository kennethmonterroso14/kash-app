import type { DisponibleReal } from '../../lib/finanzas'
import Monto from './Monto'

interface Props {
  datos: DisponibleReal
  oculto: boolean
}

export default function TarjetaDisponibleReal({ datos, oculto }: Props) {
  return (
    <div className="bg-surface rounded-tarjeta p-4">
      <p className="text-textDim text-xs uppercase tracking-widest mb-3">Disponible Real</p>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-textDim">Saldo en cuentas</span>
          <Monto oculto={oculto} valor={datos.saldo_cuentas} className="text-text" />
        </div>
        {datos.deuda_tc_vencida > 0 && (
          <div className="flex justify-between">
            <span className="text-textDim">Deuda TC vencida</span>
            <Monto oculto={oculto} valor={datos.deuda_tc_vencida} className="text-danger" signo="−" />
          </div>
        )}
        {datos.deuda_tc_acumulando > 0 && (
          <div className="flex justify-between">
            <span className="text-textDim">Deuda TC acumulando</span>
            <Monto oculto={oculto} valor={datos.deuda_tc_acumulando} className="text-warning" signo="−" />
          </div>
        )}
        <div className="border-t border-perimetro pt-1.5 flex justify-between">
          <span className="text-text font-semibold text-sm">Disponible real</span>
          <Monto
            oculto={oculto}
            valor={datos.disponible_real}
            className={`font-bold ${datos.disponible_real >= 0 ? 'text-success' : 'text-danger'}`}
          />
        </div>
      </div>

      {/*
        Solo la advertencia por disponible NEGATIVO cita un monto, así que es la
        única que se oculta en modo privado. Las otras dos ("más del 50%
        comprometido", "más del 80% del saldo") no traen cifras y son justo la
        señal de riesgo que el usuario sigue necesitando ver.
      */}
      {datos.advertencia && (datos.disponible_real >= 0 || !oculto) && (
        <p className="text-warning text-xs mt-3 bg-warning/10 rounded-chip p-2">
          {datos.advertencia}
        </p>
      )}
    </div>
  )
}
