import BotonConfirmar from '../../components/BotonConfirmar'
import { IconoEditar, IconoChevron } from '../../components/iconos'
import { calcEstadoPresupuesto, esGastoComputable } from '../../lib/finanzas'
import { useColores } from '../../hooks/useColores'
import { useMoneda } from '../../hooks/useMoneda'
import type { Presupuesto } from '../../hooks/usePresupuestos'
import type { Transaccion } from '../../hooks/useTransacciones'

interface Props {
  presupuesto: Presupuesto
  /** Movimientos del mes, sin filtrar: la tarjeta se queda con los suyos. */
  txns: Transaccion[]
  expandido: boolean
  onExpandir: () => void
  onEditar: () => void
  onBorrar: () => void
}

export default function TarjetaPresupuesto({
  presupuesto: p, txns, expandido, onExpandir, onEditar, onBorrar,
}: Props) {
  const colores = useColores()
  const fmt = useMoneda()

  // Mismo criterio que el total del mes: `gasto_tc` cuenta (un gasto con
  // tarjeta es gasto igual) y `pago_tc` no (mueve deuda, no es consumo nuevo).
  // Vive en esGastoComputable para que la barra y el detalle sumen lo mismo.
  const propias = txns
    .filter(t => esGastoComputable(t.tipo) && t.categoria === p.categoria)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
  const gastado = propias.reduce((s, t) => s + Math.abs(t.cantidad), 0)

  const { pct, estado, restante } = calcEstadoPresupuesto(gastado, p.monto_limite)
  const colorBarra = estado === 'excedido' ? colores.danger
    : estado === 'alerta' ? colores.warning
    : colores.success
  const claseTexto = estado === 'excedido' ? 'text-danger'
    : estado === 'alerta' ? 'text-warning'
    : 'text-success'

  return (
    <div className="vidrio-panel rounded-tarjeta p-4">
      <div className="flex justify-between items-center mb-2 gap-2">
        {/*
          La tarjeta es un div normal, NO un role="button". Con ese rol el
          navegador poda sus descendientes del árbol de accesibilidad
          (children presentational), así que el %, lo gastado, el límite y la
          lista de movimientos quedaban inaudibles. Solo este encabezado es el
          botón que expande.
        */}
        <button
          type="button"
          onClick={onExpandir}
          aria-expanded={expandido}
          aria-controls={`txns-${p.id}`}
          className="presionable flex items-center gap-2 rounded-chip -m-1 p-1 min-w-0"
        >
          <span className="text-text text-sm font-medium truncate">{p.categoria}</span>
          <span aria-hidden="true" className={`flex-shrink-0 ${expandido ? 'text-accent' : 'text-textDim'}`}>
            <IconoChevron direccion={expandido ? 'arriba' : 'abajo'} size={14} />
          </span>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span aria-label={`${pct}% del límite usado`} className={`text-xs tabular-nums font-semibold ${claseTexto}`}>
            {pct}%
          </span>
          <button
            type="button"
            onClick={onEditar}
            aria-label={`Editar límite de ${p.categoria}`}
            className="presionable text-xs px-2 py-1 rounded-chip text-textDim hover:text-accent"
          >
            <IconoEditar size={15} />
          </button>
          <BotonConfirmar
            accion={`Eliminar presupuesto de ${p.categoria}`}
            etiqueta="×"
            onConfirmar={onBorrar}
          />
        </div>
      </div>

      <div aria-hidden="true" className="h-2 bg-vidrio-relleno rounded-full overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all duration-normal ease-salida"
          style={{ width: `${Math.min(pct, 100)}%`, background: colorBarra }}
        />
      </div>

      <div className="flex justify-between text-xs text-textDim">
        <span>{fmt(gastado)} gastado</span>
        <span>
          {restante >= 0 ? `${fmt(restante)} restante` : `${fmt(Math.abs(restante))} excedido`}
        </span>
      </div>
      <div className="text-xs text-textDim mt-0.5 text-right">Límite: {fmt(p.monto_limite)}</div>

      {expandido && (
        <div id={`txns-${p.id}`} className="border-t border-perimetro mt-3 pt-3">
          <p className="text-textDim text-xs uppercase tracking-wider mb-2">
            {propias.length} {propias.length === 1 ? 'transacción' : 'transacciones'}
          </p>
          {propias.length === 0 ? (
            <p className="text-textDim text-xs text-center py-2">Sin gastos registrados en este mes</p>
          ) : (
            propias.map(t => (
              <div key={t.id} className="flex justify-between items-start py-2 border-b border-perimetro last:border-0 gap-4">
                <div className="min-w-0">
                  <p className="text-text text-xs truncate">{t.descripcion}</p>
                  <p className="text-textDim text-xs tracking-micro">{t.fecha}</p>
                </div>
                <span className="text-danger text-xs tabular-nums font-semibold flex-shrink-0">
                  −{fmt(Math.abs(t.cantidad))}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
