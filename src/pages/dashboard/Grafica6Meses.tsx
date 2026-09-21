import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { colores } from '../../lib/tokens'
import { useMoneda } from '../../hooks/useMoneda'

interface Props {
  /** Lo que devuelve useResumen6Meses: montos en CENTAVOS. */
  resumen: { mes: string; ingresos: number; gastos: number }[]
}

/** Ver la nota de `Etiqueta` en GraficaCategorias: estático y con `fmt` por prop. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Etiqueta = ({ active, payload, label, fmt }: any) => {
  if (!active || !payload?.length) return null
  const fila = payload[0].payload
  return (
    <div className="vidrio-panel rounded-chip px-2.5 py-1.5 text-xs">
      <p className="text-textDim mb-1">{label}</p>
      <p className="text-success">Ingresos: {fmt(fila._ingresosCent)}</p>
      <p className="text-danger">Gastos: {fmt(fila._gastosCent)}</p>
    </div>
  )
}

export default function Grafica6Meses({ resumen }: Props) {
  const fmt = useMoneda()

  // Recharts necesita el eje en unidades, no en centavos; los centavos vuelven
  // en el tooltip para formatearlos con la moneda del perfil.
  const datos = resumen.map(r => ({
    mes: r.mes,
    Ingresos: +(r.ingresos / 100).toFixed(2),
    Gastos: +(r.gastos / 100).toFixed(2),
    _ingresosCent: r.ingresos,
    _gastosCent: r.gastos,
  }))
  if (!datos.some(r => r.Ingresos > 0 || r.Gastos > 0)) return null

  return (
    <div className="bg-surface rounded-tarjeta p-4">
      <p className="text-textDim text-xs uppercase tracking-widest mb-3">Últimos 6 meses</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={datos} barCategoryGap="30%" barGap={2}>
          <XAxis dataKey="mes" tick={{ fill: colores.textDim, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip content={<Etiqueta fmt={fmt} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: colores.textDim, paddingTop: 8 }} />
          {/* De tokens.js, no hex sueltos: estas dos barras se habían quedado
              con el verde y el rojo VIEJOS cuando la paleta pasó a los system
              colors de iOS, así que eran los únicos dos colores de la app que
              no habían cambiado. */}
          <Bar dataKey="Ingresos" fill={colores.success} radius={[4, 4, 0, 0]} />
          <Bar dataKey="Gastos" fill={colores.danger} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
