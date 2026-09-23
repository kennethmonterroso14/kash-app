import type { PatrimonioNeto } from '../../lib/finanzas'
import Monto from './Monto'

interface Props {
  datos: PatrimonioNeto
  saldoCuentas: number
  valorInversiones: number
  oculto: boolean
}

export default function TarjetaPatrimonioNeto({ datos, saldoCuentas, valorInversiones, oculto }: Props) {
  return (
    <div className="vidrio-panel rounded-tarjeta p-4">
      <p className="text-textDim text-xs uppercase tracking-widest mb-3">Patrimonio Neto</p>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-textDim">Cuentas</span>
          <Monto oculto={oculto} valor={saldoCuentas} className="text-text" />
        </div>
        {valorInversiones > 0 && (
          <div className="flex justify-between">
            <span className="text-textDim">Inversiones</span>
            <Monto oculto={oculto} valor={valorInversiones} className="text-success" signo="+" />
          </div>
        )}
        <div className="flex justify-between text-xs text-textDim pt-0.5">
          <span>Total activos</span>
          <Monto oculto={oculto} valor={datos.activos} className="text-text" />
        </div>
        {datos.pasivos > 0 && (
          <div className="flex justify-between pt-1">
            <span className="text-textDim">Deuda TC</span>
            <Monto oculto={oculto} valor={datos.pasivos} className="text-danger" signo="−" />
          </div>
        )}
        <div className="border-t border-perimetro pt-1.5 flex justify-between">
          <span className="text-text font-semibold">Patrimonio neto</span>
          <Monto
            oculto={oculto}
            valor={datos.neto}
            className={`font-bold ${datos.neto >= 0 ? 'text-success' : 'text-danger'}`}
          />
        </div>
      </div>
    </div>
  )
}
