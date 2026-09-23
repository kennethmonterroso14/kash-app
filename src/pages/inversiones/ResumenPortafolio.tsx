import type { ResumenPortafolio as Resumen } from '../../lib/finanzas'
import { INFLACION_ANUAL_REF } from '../../lib/constants'
import { useMoneda } from '../../hooks/useMoneda'
import LineaEvolucion from '../../components/LineaEvolucion'

interface Props {
  resumen: Resumen
  /** Serie del portafolio ya convertida a la moneda del perfil. */
  evolucion: { fecha: string; valor_total: number }[]
}

/**
 * El portafolio como la cabecera de una acción en Bolsa: el valor grande, la
 * ganancia en una cápsula de color, la línea de evolución y debajo el capital y
 * el rendimiento anual. Todo en la moneda del perfil.
 */
export default function ResumenPortafolio({ resumen, evolucion }: Props) {
  const fmt = useMoneda()
  const signo = (n: number) => (n >= 0 ? '+' : '')
  const gana = resumen.ganancia_total >= 0

  return (
    <section aria-label="Portafolio" className="vidrio-panel rounded-tarjeta p-5 space-y-3">
      <div>
        <p className="text-textDim text-[15px] font-semibold">Valor del portafolio</p>
        <p className="text-text text-[40px] leading-[46px] font-bold tabular-nums tracking-display">
          {fmt(resumen.valor_total)}
        </p>
        <span className={`inline-flex items-center mt-1 px-2.5 h-7 rounded-full text-[13px] font-semibold tabular-nums ${
          gana ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
        }`}>
          {signo(resumen.ganancia_total)}{fmt(resumen.ganancia_total)} · {signo(resumen.ganancia_pct)}{resumen.ganancia_pct.toFixed(1)}%
        </span>
      </div>

      {/* Con un solo punto no hay evolución que mostrar, solo una línea plana. */}
      {evolucion.length > 1 && (
        <div className="pt-1 pr-1.5">
          <LineaEvolucion
            valores={evolucion.map(e => e.valor_total)}
            etiqueta={`Evolución del portafolio: de ${fmt(evolucion[0].valor_total)} a ${fmt(evolucion[evolucion.length - 1].valor_total)}`}
          />
        </div>
      )}

      <dl className="grid grid-cols-2 gap-2 pt-1">
        <div className="bg-vidrio-relleno rounded-control px-3 py-2">
          <dt className="text-textDim text-[12px]">Capital invertido</dt>
          <dd className="text-text text-[15px] font-semibold tabular-nums">{fmt(resumen.capital_total)}</dd>
        </div>
        <div className="bg-vidrio-relleno rounded-control px-3 py-2">
          <dt className="text-textDim text-[12px]">Rendimiento anual</dt>
          <dd className={`text-[15px] font-semibold tabular-nums ${
            resumen.rendimiento_anualizado >= INFLACION_ANUAL_REF ? 'text-success' : 'text-warning'
          }`}>
            {signo(resumen.rendimiento_anualizado)}{resumen.rendimiento_anualizado.toFixed(1)}% / año
          </dd>
        </div>
      </dl>
    </section>
  )
}
