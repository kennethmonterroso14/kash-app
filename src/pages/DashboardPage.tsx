import { useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  PieChart, Pie, Cell, Tooltip as PieTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip as BarTooltip, Legend,
} from 'recharts'
import { useCuentas } from '../hooks/useCuentas'
import { useTransacciones } from '../hooks/useTransacciones'
import { useResumen6Meses } from '../hooks/useResumen6Meses'
import { useTarjetas } from '../hooks/useTarjetas'
import { formatQ, calcEstadisticasMes, calcDisponibleReal } from '../lib/finanzas'
import { CAT_COLORS, MESES, mesActual } from '../lib/constants'

interface Props { user: User }

const MAX_SLICE = 5  // top N categories in donut, rest → "Otros"

export default function DashboardPage({ user }: Props) {
  const [mes, setMes] = useState(mesActual())
  const { cuentas, totalPatrimonio } = useCuentas(user.id)
  const { txns, loading } = useTransacciones(user.id, mes)
  const { data: resumen6 } = useResumen6Meses(user.id)
  const { resumenTCs, tarjetas } = useTarjetas(user.id)

  const stats = useMemo(() => calcEstadisticasMes(
    txns.map(t => ({ ...t, id: t.id, descripcion: t.descripcion }))
  ), [txns])

  const disponibleReal = useMemo(
    () => calcDisponibleReal(totalPatrimonio, tarjetas),
    [totalPatrimonio, tarjetas]
  )

  const [anio, mesNum] = mes.split('-').map(Number)
  const mesLabel = `${MESES[mesNum - 1]} ${anio}`

  // Donut data — top MAX_SLICE categories + "Otros"
  const donutData = useMemo(() => {
    const entries = Object.entries(stats.porCategoria)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
    if (entries.length === 0) return []
    const top = entries.slice(0, MAX_SLICE)
    const otrosTotal = entries.slice(MAX_SLICE).reduce((s, [, v]) => s + v, 0)
    if (otrosTotal > 0) top.push(['Otros', otrosTotal])
    return top.map(([cat, value]) => ({ cat, value, fill: CAT_COLORS[cat] ?? '#6b7590' }))
  }, [stats.porCategoria])

  // Bar chart — centavos → quetzales for display
  const barData = resumen6.map(r => ({
    mes: r.mes,
    Ingresos: +(r.ingresos / 100).toFixed(2),
    Gastos:   +(r.gastos   / 100).toFixed(2),
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PieCustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const { cat, value } = payload[0].payload
    return (
      <div style={{ background: '#12151c', borderRadius: 10, padding: '6px 10px', fontSize: 12 }}>
        <span style={{ color: '#e2e8f0' }}>{cat}: {formatQ(value)}</span>
      </div>
    )
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BarCustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: '#12151c', borderRadius: 10, padding: '6px 10px', fontSize: 12 }}>
        <p style={{ color: '#94a3b8', marginBottom: 4 }}>{label}</p>
        {payload.map((p: { name: string; value: number; color: string }) => (
          <p key={p.name} style={{ color: p.color }}>
            {p.name}: {`Q${Number(p.value).toLocaleString('es-GT', { minimumFractionDigits: 2 })}`}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      {/* Patrimonio total */}
      <div className="bg-surface rounded-2xl p-5">
        <p className="text-muted text-xs uppercase tracking-widest mb-1">Patrimonio total</p>
        <p className="text-3xl font-mono font-bold text-white">{formatQ(totalPatrimonio)}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          {cuentas.map(c => (
            <div key={c.id} className="flex items-center gap-1.5 bg-bg rounded-lg px-2 py-1">
              <div className="w-2 h-2 rounded-full" style={{ background: c.color }} />
              <span className="text-xs text-muted">{c.nombre}</span>
              <span className="text-xs font-mono text-white">{formatQ(c.saldo)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Disponible Real — solo si hay TCs registradas */}
      {tarjetas.length > 0 && (
        <div className="bg-surface rounded-2xl p-4">
          <p className="text-muted text-xs uppercase tracking-widest mb-3">Disponible Real</p>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Saldo en cuentas</span>
              <span className="font-mono text-white">{formatQ(disponibleReal.saldo_cuentas)}</span>
            </div>
            {disponibleReal.deuda_tc_vencida > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">Deuda TC vencida</span>
                <span className="font-mono text-danger">−{formatQ(disponibleReal.deuda_tc_vencida)}</span>
              </div>
            )}
            {disponibleReal.deuda_tc_acumulando > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">Deuda TC acumulando</span>
                <span className="font-mono text-warning">−{formatQ(disponibleReal.deuda_tc_acumulando)}</span>
              </div>
            )}
            <div className="border-t border-muted/20 pt-1.5 flex justify-between">
              <span className="text-white font-semibold text-sm">Disponible real</span>
              <span className={`font-mono font-bold ${disponibleReal.disponible_real >= 0 ? 'text-success' : 'text-danger'}`}>
                {formatQ(disponibleReal.disponible_real)}
              </span>
            </div>
          </div>
          {disponibleReal.advertencia && (
            <p className="text-warning text-xs mt-3 bg-warning/10 rounded-lg p-2">
              {disponibleReal.advertencia}
            </p>
          )}
        </div>
      )}

      {/* Mini-cards TC — scroll horizontal */}
      {resumenTCs.length > 0 && (
        <div>
          <p className="text-muted text-xs uppercase tracking-widest mb-2">Tarjetas de crédito</p>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
            {resumenTCs.map(({ tc, resumen }) => (
              <div key={tc.id} className="bg-surface rounded-xl p-3 flex-shrink-0 w-44 space-y-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tc.color }} />
                  <p className="text-white text-xs font-semibold truncate">{tc.nombre}</p>
                </div>
                <div>
                  <p className="text-muted text-xs">Disponible</p>
                  <p className="font-mono text-sm text-white font-semibold">{formatQ(resumen.disponible)}</p>
                </div>
                <div className="h-1 bg-bg rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      resumen.estado === 'critico' ? 'bg-danger' :
                      resumen.estado === 'alerta'  ? 'bg-warning' : 'bg-success'
                    }`}
                    style={{ width: `${Math.min(resumen.pct_uso, 100)}%` }}
                  />
                </div>
                {tc.deuda_ciclo_anterior > 0 && (
                  <p className="text-danger text-xs">⚠ Pago pendiente</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selector de mes */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            const d = new Date(anio, mesNum - 2, 1)
            setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
          }}
          className="text-muted hover:text-white p-2"
        >←</button>
        <span className="text-white font-medium">{mesLabel}</span>
        <button
          onClick={() => {
            const d = new Date(anio, mesNum, 1)
            setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
          }}
          className="text-muted hover:text-white p-2"
        >→</button>
      </div>

      {/* Stats del mes */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface rounded-2xl p-4">
          <p className="text-muted text-xs mb-1">Ingresos</p>
          <p className="text-success font-mono font-semibold text-sm">{formatQ(stats.ingresos)}</p>
        </div>
        <div className="bg-surface rounded-2xl p-4">
          <p className="text-muted text-xs mb-1">Gastos</p>
          <p className="text-danger font-mono font-semibold text-sm">{formatQ(stats.gastos)}</p>
        </div>
        <div className="bg-surface rounded-2xl p-4">
          <p className="text-muted text-xs mb-1">Neto</p>
          <p className={`font-mono font-semibold text-sm ${stats.neto >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatQ(stats.neto)}
          </p>
        </div>
      </div>

      {/* Ahorro % */}
      {stats.ingresos > 0 && (
        <div className="bg-surface rounded-2xl p-4">
          <div className="flex justify-between mb-2">
            <span className="text-muted text-sm">Tasa de ahorro</span>
            <span className={`font-mono font-semibold text-sm ${stats.pctAhorro >= 25 ? 'text-success' : 'text-danger'}`}>
              {stats.pctAhorro}%
            </span>
          </div>
          <div className="h-2 bg-bg rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${stats.pctAhorro >= 25 ? 'bg-success' : 'bg-danger'}`}
              style={{ width: `${Math.min(stats.pctAhorro, 100)}%` }}
            />
          </div>
          {stats.pctAhorro < 25 && (
            <p className="text-danger text-xs mt-2">Meta mínima: 25% de ahorro</p>
          )}
        </div>
      )}

      {/* Donut — gastos por categoría */}
      {donutData.length > 0 && (
        <div className="bg-surface rounded-2xl p-4">
          <p className="text-muted text-xs uppercase tracking-widest mb-3">Gastos por categoría</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={donutData}
                dataKey="value"
                nameKey="cat"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
              >
                {donutData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <PieTooltip content={<PieCustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Leyenda */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
            {donutData.map(({ cat, value, fill }) => (
              <div key={cat} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: fill }} />
                <span className="text-xs text-muted">{cat}</span>
                <span className="text-xs font-mono text-white">{formatQ(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bar chart — últimos 6 meses */}
      {barData.some(r => r.Ingresos > 0 || r.Gastos > 0) && (
        <div className="bg-surface rounded-2xl p-4">
          <p className="text-muted text-xs uppercase tracking-widest mb-3">Últimos 6 meses</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData} barCategoryGap="30%" barGap={2}>
              <XAxis
                dataKey="mes"
                tick={{ fill: '#3d4255', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <BarTooltip content={<BarCustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, color: '#3d4255', paddingTop: 8 }}
              />
              <Bar dataKey="Ingresos" fill="#4ade80" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Gastos"   fill="#f87171" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {loading && <p className="text-muted text-center text-sm">Cargando...</p>}

      {!loading && txns.length === 0 && (
        <div className="bg-surface rounded-2xl p-6 text-center">
          <p className="text-muted text-sm">Sin movimientos en {mesLabel}</p>
          <p className="text-muted text-xs mt-1">Agrega el primero con el botón +</p>
        </div>
      )}
    </div>
  )
}
