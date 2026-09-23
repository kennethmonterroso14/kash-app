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

/**
 * Una tarjeta como en Wallet: la cara de la tarjeta en su color (nombre, banco,
 * últimos 4 y disponible) y, debajo, el panel de vidrio del ciclo con la deuda
 * por bucket y las acciones.
 *
 * El texto de la cara es siempre blanco sobre el color que eligió el usuario;
 * un velo oscuro en diagonal garantiza el contraste aunque elija un color claro.
 */
export default function TarjetaTile({
  tc, resumen, onEditar, onCargo, onPago, onCerrarCiclo, onHistorial,
}: Props) {
  const fmt = useMoneda()

  // Clases LITERALES y no `bg-${estado}`: el JIT de Tailwind busca los nombres
  // como texto en el fuente, así que una clase armada por interpolación no se
  // genera nunca y el color simplemente no aparece.
  const claseBarra =
    resumen.estado === 'critico' ? 'bg-danger' :
    resumen.estado === 'alerta'  ? 'bg-warning' : 'bg-success'
  const claseUso =
    resumen.estado === 'critico' ? 'text-danger' :
    resumen.estado === 'alerta'  ? 'text-warning' : 'text-success'

  return (
    <article aria-label={tc.nombre} className="space-y-2.5">
      {/* La cara de la tarjeta. */}
      <div
        className="relative overflow-hidden rounded-tarjeta aspect-[1.7] p-5 flex flex-col justify-between text-white shadow-panel"
        style={{
          background: `linear-gradient(135deg, ${tc.color}, color-mix(in srgb, ${tc.color} 45%, #0b0b12))`,
        }}
      >
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/35" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[17px] font-semibold truncate">{tc.nombre}</p>
            {tc.banco && <p className="text-[13px] text-white/75 truncate">{tc.banco}</p>}
          </div>
          <button
            type="button"
            onClick={onEditar}
            aria-label={`Editar ${tc.nombre}`}
            title="Editar tarjeta"
            className="presionable grid place-items-center w-9 h-9 -mr-1.5 -mt-1.5 rounded-full bg-white/15 text-white"
          >
            <IconoEditar size={16} />
          </button>
        </div>
        <div className="relative">
          <p className="text-[13px] text-white/75">Disponible</p>
          <p className="text-[30px] leading-9 font-bold tabular-nums tracking-display">{fmt(resumen.disponible)}</p>
          <div className="flex items-center justify-between mt-1 text-[13px] text-white/80 tabular-nums">
            <span>{tc.ultimos_4 ? `•••• ${tc.ultimos_4}` : ''}</span>
            <span>Límite {fmt(tc.limite_credito)}</span>
          </div>
        </div>
      </div>

      {/* El panel del ciclo. */}
      <div className="vidrio-panel rounded-tarjeta p-4 space-y-3">
        <div>
          <div className="flex justify-between text-[13px] mb-1.5">
            <span className="text-textDim">Uso del límite</span>
            <span className={`font-semibold tabular-nums ${claseUso}`}>{resumen.pct_uso}%</span>
          </div>
          <div aria-hidden="true" className="h-1.5 bg-vidrio-relleno rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${claseBarra} transition-all duration-normal ease-salida`}
              style={{ width: `${Math.min(resumen.pct_uso, 100)}%` }}
            />
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-vidrio-relleno rounded-control py-2">
            <dt className="text-textDim text-[12px]">Ciclo actual</dt>
            <dd className="text-text text-[14px] font-semibold tabular-nums">{fmt(tc.deuda_actual)}</dd>
          </div>
          <div className="bg-vidrio-relleno rounded-control py-2">
            <dt className="text-textDim text-[12px]">Cierre</dt>
            <dd className="text-text text-[14px] font-semibold">en {resumen.dias_para_cierre}d</dd>
          </div>
          <div className="bg-vidrio-relleno rounded-control py-2">
            <dt className="text-textDim text-[12px]">Pago</dt>
            <dd className="text-text text-[14px] font-semibold">en {resumen.dias_para_pago}d</dd>
          </div>
        </dl>

        {tc.deuda_ciclo_anterior > 0 && (
          <div className="bg-danger/10 border border-danger/20 rounded-control p-3">
            <p className="text-danger text-[13px] font-semibold flex items-start gap-1">
              <IconoAlerta size={14} className="shrink-0 mt-0.5" />
              <span>Pagar {fmt(tc.deuda_ciclo_anterior)} antes del día {tc.dia_pago}</span>
            </p>
            <p className="text-danger/80 text-[12px] mt-0.5">
              {resumen.dias_para_pago} días restantes para el pago
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onCargo}
            className="presionable flex-1 h-10 rounded-full bg-accent/15 text-accent text-[14px] font-semibold"
          >
            + Cargo
          </button>
          <button
            onClick={onPago}
            className="presionable flex-1 h-10 rounded-full bg-vidrio-relleno text-text text-[14px] font-semibold"
          >
            Pagar
          </button>
          <button
            onClick={onCerrarCiclo}
            disabled={tc.deuda_actual === 0}
            className="presionable flex-1 h-10 rounded-full bg-vidrio-relleno text-textDim text-[14px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cerrar ciclo
          </button>
        </div>
        <button
          onClick={onHistorial}
          className="presionable w-full flex items-center justify-between text-[15px] text-text pt-1"
        >
          Estados de cuenta <IconoChevron direccion="der" size={16} className="text-textDim" />
        </button>
      </div>
    </article>
  )
}
