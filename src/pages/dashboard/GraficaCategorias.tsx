import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { COLOR_CATEGORIA_FALLBACK } from '../../lib/constants'
import { useMoneda } from '../../hooks/useMoneda'

/** Rebanadas antes de agrupar la cola en "Otros". */
const MAX_REBANADAS = 5

interface Props {
  /** Centavos por categoría, tal como los devuelve calcEstadisticasMes. */
  porCategoria: Record<string, number>
  coloresCategorias: Record<string, string>
}

/**
 * Tooltip propio con clases y no con `style`, así la paleta sigue viviendo solo
 * en tokens.js. Va a nivel de módulo y no dentro del render: un componente
 * recreado en cada render rompe la reconciliación (lo marca
 * react-hooks/static-components). El formateador entra como prop porque
 * Recharts clona el elemento y le agrega `active`/`payload` conservando el
 * resto.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Etiqueta = ({ active, payload, fmt }: any) => {
  if (!active || !payload?.length) return null
  const { cat, value } = payload[0].payload
  return (
    <div className="vidrio-panel rounded-chip px-2.5 py-1.5 text-xs">
      <span className="text-text">{cat}: {fmt(value)}</span>
    </div>
  )
}

export default function GraficaCategorias({ porCategoria, coloresCategorias }: Props) {
  const fmt = useMoneda()

  const datos = (() => {
    const entradas = Object.entries(porCategoria)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
    if (entradas.length === 0) return []

    const top = entradas.slice(0, MAX_REBANADAS)
    const cola = entradas.slice(MAX_REBANADAS).reduce((s, [, v]) => s + v, 0)
    if (cola > 0) {
      // 'Otros' también es una categoría REAL del usuario: si ya está en el
      // top hay que sumarle la cola, no agregar una segunda rebanada idéntica.
      const i = top.findIndex(([c]) => c === 'Otros')
      if (i >= 0) top[i] = ['Otros', top[i][1] + cola]
      else top.push(['Otros', cola])
      top.sort(([, a], [, b]) => b - a)   // la fusionada puede haber cambiado de lugar
    }
    return top.map(([cat, value]) => ({
      cat, value, fill: coloresCategorias[cat] ?? COLOR_CATEGORIA_FALLBACK,
    }))
  })()

  if (datos.length === 0) return null

  return (
    <div className="bg-surface rounded-tarjeta p-4">
      <p className="text-textDim text-xs uppercase tracking-widest mb-3">Gastos por categoría</p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={datos} dataKey="value" nameKey="cat"
            cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}
          >
            {datos.map(d => <Cell key={d.cat} fill={d.fill} />)}
          </Pie>
          <Tooltip content={<Etiqueta fmt={fmt} />} />
        </PieChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
        {datos.map(({ cat, value, fill }) => (
          <div key={cat} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: fill }} />
            <span className="text-xs text-textDim">{cat}</span>
            <span className="text-xs tabular-nums text-text">{fmt(value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
