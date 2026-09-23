import type { ResumenTC, TarjetaCredito } from '../../lib/finanzas'
import { useMoneda } from '../../hooks/useMoneda'
import { IconoEditar, IconoAlerta, IconoChevron } from '../../components/iconos'

interface Props {
  tc: TarjetaCredito
  resumen: ResumenTC
  onEditar: () => void
  onCargo: () => void
  onPago: () => void
  onCerrarCiclo: () => void
  onHistorial: () => void
}

/** Una tarjeta en la lista: disponible, uso, deuda por bucket y acciones. */
export default function TarjetaTile({
  tc, resumen, onEditar, onCargo, onPago, onCerrarCiclo, onHistorial,
}: Props) {
  const fmt = useMoneda()

  // Clases LITERALES y no `bg-${estado}`: el JIT de Tailwind busca los nombres
  // como texto en el fuente, así que una clase armada por interpolación no se
  // genera nunca y el color simplemente no aparece.
  const clasesChip =
    resumen.estado === 'critico' ? 'bg-danger/10 text-danger' :
    resumen.estado === 'alerta'  ? 'bg-warning/10 text-warning' :
                                   'bg-success/10 text-success'
  const claseBarra =
    resumen.estado === 'critico' ? 'bg-danger' :
    resumen.estado === 'alerta'  ? 'bg-warning' : 'bg-success'

  return (
    <div className="vidrio-panel rounded-tarjeta p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: tc.color }} />
          <div>
            <p className="text-text font-semibold text-sm">{tc.nombre}</p>
            {(tc.banco || tc.ultimos_4) && (
              <p className="text-textDim text-xs tracking-micro">
                {tc.banco}{tc.ultimos_4 ? ` ••••${tc.ultimos_4}` : ''}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* whitespace-nowrap: con un nombre largo el chip se partía en dos
              renglones y quedaba como un óvalo alto. */}
          <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${clasesChip}`}>
            {resumen.pct_uso}% usado
          </span>
          <button
            onClick={onEditar}
            className="presionable text-textDim hover:text-text text-sm leading-none px-1"
            title="Editar tarjeta"
          >
            <IconoEditar size={15} />
          </button>
        </div>
      </div>

      <div>
        <p className="text-textDim text-xs mb-0.5 tracking-micro">Disponible</p>
        <p className="text-text tabular-nums font-bold text-2xl tracking-titulo">{fmt(resumen.disponible)}</p>
      </div>

      <div className="h-1.5 bg-vidrio-relleno rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${claseBarra} transition-all duration-normal ease-salida`}
          style={{ width: `${Math.min(resumen.pct_uso, 100)}%` }}
        />
      </div>

      <div className="flex justify-between text-xs">
        <span className="text-textDim">
          Ciclo actual: <span className="text-text tabular-nums">{fmt(tc.deuda_actual)}</span>
        </span>
        <span className="text-textDim">
          Límite: <span className="text-text tabular-nums">{fmt(tc.limite_credito)}</span>
        </span>
      </div>

      {tc.deuda_ciclo_anterior > 0 && (
        <div className="bg-danger/10 border border-danger/20 rounded-control p-3">
          <p className="text-danger text-xs font-semibold flex items-start gap-1">
            <IconoAlerta size={14} className="shrink-0 mt-0.5" />
            <span>Pagar {fmt(tc.deuda_ciclo_anterior)} antes del día {tc.dia_pago}</span>
          </p>
          <p className="text-danger/70 text-xs mt-0.5">
            {resumen.dias_para_pago} días restantes para el pago
          </p>
        </div>
      )}

      <div className="flex gap-4 text-xs text-textDim">
        <span>Cierre en <span className="text-text">{resumen.dias_para_cierre}d</span></span>
        <span>Pago en <span className="text-text">{resumen.dias_para_pago}d</span></span>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCargo}
          className="presionable flex-1 py-2 rounded-control bg-accent/10 text-accent text-xs font-semibold hover:bg-accent/20"
        >
          + Cargo
        </button>
        <button
          onClick={onPago}
          className="presionable flex-1 py-2 rounded-control bg-vidrio-relleno text-text text-xs font-semibold"
        >
          Pagar TC
        </button>
        <button
          onClick={onCerrarCiclo}
          disabled={tc.deuda_actual === 0}
          className="presionable flex-1 py-2 rounded-control bg-vidrio-relleno text-textDim text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Cerrar ciclo
        </button>
      </div>
      <button
        onClick={onHistorial}
        className="presionable text-xs text-textDim hover:text-text py-1 inline-flex items-center gap-1"
      >
        Ver historial <IconoChevron direccion="der" size={13} />
      </button>
    </div>
  )
}
