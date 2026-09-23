import { calcRendimientoAnualizado, usdToGTQ, type Inversion } from '../../lib/finanzas'
import { INFLACION_ANUAL_REF, fechaCorta } from '../../lib/constants'
import { useMoneda } from '../../hooks/useMoneda'
import AvatarCategoria from '../../components/AvatarCategoria'
import { IconoAlerta, IconoCheck, IconoEditar } from '../../components/iconos'

interface Props {
  inv: Inversion
  /** Centavos de la moneda del perfil por 1 USD. */
  tipoCambioUSD: number
  onEditar: () => void
  onActualizar: () => void
}

/**
 * Una inversión en la lista: avatar, nombre y plataforma; el valor actual en
 * grande; capital, ganancia y rendimiento en celdas de relleno (igual que el
 * panel de ciclo de Tarjetas); y abajo si le gana a la inflación.
 *
 * Las filas USD están guardadas en centavos de DÓLAR, no en la moneda del
 * perfil, así que se muestran en su moneda nativa y debajo la conversión.
 */
export default function InversionTile({ inv, tipoCambioUSD, onEditar, onActualizar }: Props) {
  const fmt = useMoneda()
  const esUSD = inv.moneda === 'USD'
  /** El monto en su moneda nativa. */
  const nativo = (centavos: number) => (esUSD ? fmt(centavos, 'USD') : fmt(centavos))
  /** El mismo monto convertido a la moneda del perfil. */
  const convertido = (centavos: number) => fmt(usdToGTQ(centavos, tipoCambioUSD))

  const rendimiento = inv.monto_invertido > 0
    ? calcRendimientoAnualizado(inv.monto_invertido, inv.valor_actual, inv.fecha_inicio)
    : 0
  const gananciaNativa = inv.valor_actual - inv.monto_invertido
  const gananciaConvertida =
    usdToGTQ(inv.valor_actual, tipoCambioUSD) - usdToGTQ(inv.monto_invertido, tipoCambioUSD)
  const superaInflacion = rendimiento > INFLACION_ANUAL_REF
  const signo = (n: number) => (n >= 0 ? '+' : '')

  return (
    <article aria-label={inv.nombre} className="vidrio-panel rounded-tarjeta p-4 space-y-3">
      <div className="flex items-center gap-3">
        <AvatarCategoria categoria={inv.nombre} color={esUSD ? 'rgb(var(--c-success))' : 'rgb(var(--c-accent))'} size={40} />
        <div className="flex-1 min-w-0">
          <p className="text-text text-[16px] font-semibold truncate">{inv.nombre}</p>
          <p className="text-textDim text-[13px] truncate capitalize">
            {[inv.plataforma, inv.tipo].filter(Boolean).join(' · ')}
            {esUSD && <span className="ml-1.5 normal-case text-warning font-semibold">USD</span>}
          </p>
        </div>
        <button
          onClick={onEditar}
          className="presionable grid place-items-center w-9 h-9 rounded-full bg-vidrio-relleno text-textDim hover:text-text flex-shrink-0"
          aria-label={`Editar ${inv.nombre}`}
          title="Editar inversión"
        >
          <IconoEditar size={16} />
        </button>
      </div>

      <div>
        <p className="text-textDim text-[13px]">Valor actual</p>
        <p className="text-text text-[26px] leading-8 font-bold tabular-nums tracking-titulo">{nativo(inv.valor_actual)}</p>
        {esUSD && (
          <p className="text-textDim text-[13px] tabular-nums">
            ≈ {convertido(inv.valor_actual)} · ganancia ≈ {signo(gananciaConvertida)}{fmt(gananciaConvertida)}
          </p>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-vidrio-relleno rounded-control py-2 px-1">
          <dt className="text-textDim text-[12px]">Capital</dt>
          <dd className="text-text text-[14px] font-semibold tabular-nums truncate">{nativo(inv.monto_invertido)}</dd>
        </div>
        <div className="bg-vidrio-relleno rounded-control py-2 px-1">
          <dt className="text-textDim text-[12px]">Ganancia</dt>
          <dd className={`text-[14px] font-semibold tabular-nums truncate ${gananciaNativa >= 0 ? 'text-success' : 'text-danger'}`}>
            {signo(gananciaNativa)}{nativo(gananciaNativa)}
          </dd>
        </div>
        <div className="bg-vidrio-relleno rounded-control py-2 px-1">
          <dt className="text-textDim text-[12px]">Anual</dt>
          <dd className={`text-[14px] font-semibold tabular-nums ${superaInflacion ? 'text-success' : 'text-warning'}`}>
            {signo(rendimiento)}{rendimiento.toFixed(1)}%
          </dd>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p
            title={`Inflación de referencia: ~${INFLACION_ANUAL_REF}% anual`}
            className={`text-[13px] font-medium flex items-center gap-1 whitespace-nowrap ${superaInflacion ? 'text-success' : 'text-warning'}`}
          >
            {superaInflacion
              ? <><IconoCheck size={14} className="shrink-0" /> Supera la inflación</>
              : <><IconoAlerta size={14} className="shrink-0" /> Por debajo de la inflación</>}
          </p>
          {inv.fecha_ultimo_update && (
            <p className="text-textDim text-[12px]">Actualizado el {fechaCorta(inv.fecha_ultimo_update)}</p>
          )}
        </div>
        <button
          onClick={onActualizar}
          className="presionable h-9 px-3.5 rounded-full bg-accent/15 text-accent text-[14px] font-semibold flex-shrink-0"
        >
          Actualizar valor
        </button>
      </div>
    </article>
  )
}
