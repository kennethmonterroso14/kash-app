import {
  LineChart, Line, XAxis, YAxis, Tooltip as RechartTooltip, ResponsiveContainer,
} from 'recharts'
import type { ResumenPortafolio as Resumen } from '../../lib/finanzas'
import { INFLACION_ANUAL_REF } from '../../lib/constants'
import { useColores } from '../../hooks/useColores'
import { useMoneda } from '../../hooks/useMoneda'

interface Props {
  resumen: Resumen
  /** Serie del portafolio ya convertida a la moneda del perfil. */
  evolucion: { fecha: string; valor_total: number }[]
}

/** Las cuatro cifras del portafolio más la evolución. Todo en moneda del perfil. */
export default function ResumenPortafolio({ resumen, evolucion }: Props) {
  const colores = useColores()
  const fmt = useMoneda()
  const signo = (n: number) => (n >= 0 ? '+' : '')

  return (
    <div className="vidrio-panel rounded-tarjeta p-4 mb-4 space-y-3">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-textDim text-xs mb-0.5 tracking-micro">Capital invertido</p>
          <p className="text-text tabular-nums">{fmt(resumen.capital_total)}</p>
        </div>
        <div>
          <p className="text-textDim text-xs mb-0.5 tracking-micro">Valor actual</p>
          <p className="text-text tabular-nums font-bold">{fmt(resumen.valor_total)}</p>
        </div>
        <div>
          <p className="text-textDim text-xs mb-0.5 tracking-micro">Ganancia total</p>
          <p className={`tabular-nums font-semibold ${resumen.ganancia_total >= 0 ? 'text-success' : 'text-danger'}`}>
            {signo(resumen.ganancia_total)}{fmt(resumen.ganancia_total)}
            <span className="text-xs ml-1">
              ({signo(resumen.ganancia_pct)}{resumen.ganancia_pct.toFixed(1)}%)
            </span>
          </p>
        </div>
        <div>
          <p className="text-textDim text-xs mb-0.5 tracking-micro">Rendimiento anual</p>
          <p className={`tabular-nums font-semibold ${
            resumen.rendimiento_anualizado >= INFLACION_ANUAL_REF ? 'text-success' : 'text-warning'
          }`}>
            {signo(resumen.rendimiento_anualizado)}{resumen.rendimiento_anualizado.toFixed(1)}% / año
          </p>
        </div>
      </div>

      {/* Con un solo punto no hay evolución que mostrar, solo una línea plana. */}
      {evolucion.length > 1 && (
        <div className="-mx-1">
          <p className="text-textDim text-xs mb-1.5 px-1 tracking-micro">Evolución del portafolio</p>
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={evolucion}>
              <XAxis dataKey="fecha" hide />
              <YAxis hide domain={['auto', 'auto']} />
              <RechartTooltip
                formatter={(v: unknown) => [fmt(v as number), 'Valor']}
                labelFormatter={(l: unknown) => l as string}
                contentStyle={{ background: colores.surface, border: 'none', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: colores.textDim }}
              />
              {/* Los colores salen de tokens.js, no como hex sueltos: una
                  gráfica con el color viejo tras un cambio de paleta era
                  exactamente el defecto que ese archivo vino a cerrar. */}
              <Line
                type="monotone" dataKey="valor_total"
                stroke={colores.accent} strokeWidth={2} dot={false}
                activeDot={{ r: 4, fill: colores.accent }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
