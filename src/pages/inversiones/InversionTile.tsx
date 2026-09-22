import { calcRendimientoAnualizado, usdToGTQ, type Inversion } from '../../lib/finanzas'
import { INFLACION_ANUAL_REF } from '../../lib/constants'
import { useMoneda } from '../../hooks/useMoneda'
import { IconoEditar } from '../../components/iconos'

interface Props {
  inv: Inversion
  /** Centavos de la moneda del perfil por 1 USD. */
  tipoCambioUSD: number
  onEditar: () => void
  onActualizar: () => void
}

/**
 * Una inversión en la lista.
 *
 * Las filas USD están guardadas en centavos de DÓLAR, no en la moneda del
 * perfil, así que se muestran en su moneda nativa y debajo la conversión. El
 * formateo de los montos USD iba a mano (`$${x / 100}.toFixed(2)`), que se
 * saltaba el separador de miles; ahora es `fmt(x, 'USD')`.
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
    <div className="bg-surface rounded-tarjeta p-4 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-text font-semibold text-sm truncate">{inv.nombre}</p>
          {inv.plataforma && <p className="text-textDim text-xs truncate tracking-micro">{inv.plataforma}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs text-textDim bg-surface2 px-2 py-0.5 rounded-full whitespace-nowrap">{inv.tipo}</span>
          {esUSD && (
            <span className="text-xs text-warning bg-warning/10 px-2 py-0.5 rounded-full">USD</span>
          )}
          <button
            onClick={onEditar}
            className="presionable text-textDim hover:text-text text-sm ml-0.5"
            aria-label={`Editar ${inv.nombre}`}
            title="Editar inversión"
          >
            <IconoEditar size={15} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-textDim tracking-micro">Capital</p>
          <p className="text-text tabular-nums">{nativo(inv.monto_invertido)}</p>
          {esUSD && <p className="text-textDim">~ {convertido(inv.monto_invertido)}</p>}
        </div>
        <div>
          <p className="text-textDim tracking-micro">Valor actual</p>
          <p className="text-text tabular-nums font-bold">{nativo(inv.valor_actual)}</p>
          {esUSD && <p className="text-textDim">~ {convertido(inv.valor_actual)}</p>}
        </div>
        <div>
          <p className="text-textDim tracking-micro">Ganancia</p>
          <p className={`tabular-nums font-semibold ${gananciaNativa >= 0 ? 'text-success' : 'text-danger'}`}>
            {signo(gananciaNativa)}{nativo(gananciaNativa)}
          </p>
          {esUSD && (
            <p className={`text-xs ${gananciaConvertida >= 0 ? 'text-success/70' : 'text-danger/70'}`}>
              ~ {signo(gananciaConvertida)}{fmt(gananciaConvertida)}
            </p>
          )}
        </div>
        <div>
          <p className="text-textDim tracking-micro">Anualizado</p>
          <p className={`tabular-nums font-semibold ${rendimiento >= INFLACION_ANUAL_REF ? 'text-success' : 'text-warning'}`}>
            {signo(rendimiento)}{rendimiento.toFixed(1)}% / año
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <p className={`text-xs ${superaInflacion ? 'text-success' : 'text-warning'}`}>
          {superaInflacion
            ? `✅ Supera inflación (~${INFLACION_ANUAL_REF}%)`
            : '⚠️ Por debajo de inflación'}
        </p>
        <button
          onClick={onActualizar}
          className="presionable text-xs px-3 py-1.5 rounded-control bg-accent/10 text-accent hover:bg-accent/20 flex-shrink-0"
        >
          Actualizar valor
        </button>
      </div>

      {inv.fecha_ultimo_update && (
        <p className="text-textDim text-xs tracking-micro">Actualizado: {inv.fecha_ultimo_update}</p>
      )}
    </div>
  )
}
