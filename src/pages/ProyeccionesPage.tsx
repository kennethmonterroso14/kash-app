import { useMemo, useState, useId } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useCuentas } from '../hooks/useCuentas'
import { proyectarPatrimonio, formatQ, toCentavos } from '../lib/finanzas'

// ─── Types ───────────────────────────────────────────────────

interface Props {
  userId: string
}

interface ChartPoint {
  label: string   // "2026"
  patrimonio: number  // centavos
  fechaDisplay: string  // "Abr 2026"
}

// ─── Constants ───────────────────────────────────────────────

const HORIZONTE_OPTIONS: { label: string; meses: number }[] = [
  { label: '1 año',  meses: 12  },
  { label: '3 años', meses: 36  },
  { label: '5 años', meses: 60  },
  { label: '10 años',meses: 120 },
]

const MILESTONE_YEARS = [1, 3, 5] as const

const MESES_ES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

// ─── Helpers ─────────────────────────────────────────────────

function formatFecha(fecha: Date): string {
  return `${MESES_ES[fecha.getMonth()]} ${fecha.getFullYear()}`
}

function formatYAxis(centavos: number): string {
  const q = centavos / 100
  if (q >= 1_000_000) return `Q${(q / 1_000_000).toFixed(1)}M`
  if (q >= 1_000)     return `Q${(q / 1_000).toFixed(0)}k`
  return `Q${Math.round(q).toLocaleString('es-GT')}`
}

function growthPct(current: number, projected: number): number {
  if (current === 0) return 0
  return Math.round(((projected - current) / current) * 100)
}

// ─── Custom Tooltip ──────────────────────────────────────────

interface TooltipProps {
  active?: boolean
  payload?: { value: number; payload: ChartPoint }[]
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0].payload
  return (
    <div className="bg-surface border border-[#4a4f5e]/40 rounded-xl px-3 py-2 text-sm shadow-lg">
      <p className="text-[#4a4f5e] text-xs mb-0.5">{point.fechaDisplay}</p>
      <p className="text-success font-semibold">{formatQ(Math.round(point.patrimonio))}</p>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────

export default function ProyeccionesPage({ userId }: Props) {
  const gradientId = useId()
  const { totalPatrimonio, loading } = useCuentas(userId)

  const [ahorroMensualQ, setAhorroMensualQ] = useState(2000)
  const [rendimientoPct, setRendimientoPct] = useState(7)
  const [horizonteIdx, setHorizonteIdx] = useState(2) // default: 5 años

  const meses = HORIZONTE_OPTIONS[horizonteIdx].meses

  // ─── Projection ──────────────────────────────────────────

  const puntos = useMemo(() => {
    if (loading) return []
    const ahorroMensual = toCentavos(Math.max(0, ahorroMensualQ))
    const rendimientoAnual = Math.max(0, Math.min(1, rendimientoPct / 100))
    return proyectarPatrimonio({
      patrimonioActual: totalPatrimonio,
      ahorroMensual,
      rendimientoAnual,
      meses,
    })
  }, [loading, totalPatrimonio, ahorroMensualQ, rendimientoPct, meses])

  // ─── Chart data (one point per year) ─────────────────────

  const chartData = useMemo((): ChartPoint[] => {
    if (puntos.length === 0) return []
    // One point per year — each key is overwritten, keeping the last (end-of-year) value
    const byYear: Record<number, typeof puntos[0]> = {}
    for (const p of puntos) {
      byYear[p.fecha.getFullYear()] = p
    }
    return Object.values(byYear).map(p => ({
      label: String(p.fecha.getFullYear()),
      patrimonio: p.patrimonio,
      fechaDisplay: formatFecha(p.fecha),
    }))
  }, [puntos])

  // ─── Milestone summary cards ─────────────────────────────

  const milestones = useMemo(() => {
    return MILESTONE_YEARS
      .filter(yr => yr * 12 <= meses)
      .map(yr => {
        const targetMes = yr * 12
        const punto = puntos[targetMes - 1]
        if (!punto) return null
        return {
          label: yr === 1 ? '1 año' : `${yr} años`,
          patrimonio: punto.patrimonio,
          growth: growthPct(totalPatrimonio, punto.patrimonio),
        }
      })
      .filter(Boolean) as { label: string; patrimonio: number; growth: number }[]
  }, [puntos, meses, totalPatrimonio])

  // ─── Render ──────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0d0f14] text-white pb-24">
      <div className="max-w-lg mx-auto px-4 pt-8 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Proyecciones</h1>
          <p className="text-[#4a4f5e] text-sm mt-1">
            Patrimonio actual:{' '}
            {loading
              ? <span className="animate-pulse">cargando…</span>
              : <span className="text-white font-semibold">{formatQ(totalPatrimonio)}</span>
            }
          </p>
        </div>

        {/* Inputs */}
        <div className="bg-surface rounded-2xl p-4 space-y-4">

          {/* Ahorro mensual */}
          <div>
            <label className="text-xs text-[#4a4f5e] uppercase tracking-wider mb-1.5 block">
              Ahorro mensual (Q)
            </label>
            <input
              type="number"
              min={0}
              step={100}
              value={ahorroMensualQ}
              onChange={e => setAhorroMensualQ(Number(e.target.value))}
              className="w-full bg-[#0d0f14] border border-[#4a4f5e]/30 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent/60 transition-colors"
            />
          </div>

          {/* Rendimiento anual */}
          <div>
            <label className="text-xs text-[#4a4f5e] uppercase tracking-wider mb-1.5 block">
              Rendimiento anual (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={rendimientoPct}
              onChange={e => setRendimientoPct(Number(e.target.value))}
              className="w-full bg-[#0d0f14] border border-[#4a4f5e]/30 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent/60 transition-colors"
            />
          </div>

          {/* Horizonte segmented control */}
          <div>
            <label className="text-xs text-[#4a4f5e] uppercase tracking-wider mb-1.5 block">
              Horizonte
            </label>
            <div className="flex bg-[#0d0f14] rounded-xl p-1 gap-1">
              {HORIZONTE_OPTIONS.map((opt, i) => (
                <button
                  key={opt.meses}
                  onClick={() => setHorizonteIdx(i)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    horizonteIdx === i
                      ? 'bg-accent text-[#0d0f14]'
                      : 'text-[#4a4f5e] hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-surface rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-[#4a4f5e] uppercase tracking-wider mb-4">
            Crecimiento proyectado
          </h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#c8f564" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#c8f564" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#4a4f5e', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatYAxis}
                  tick={{ fill: '#4a4f5e', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={54}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="patrimonio"
                  stroke="#c8f564"
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={{ r: 4, fill: '#c8f564', strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-[#4a4f5e] text-sm">
              Cargando proyección…
            </div>
          )}
        </div>

        {/* Milestone summary cards */}
        {milestones.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-[#4a4f5e] uppercase tracking-wider mb-3">
              Metas proyectadas
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {milestones.map(m => (
                <div key={m.label} className="bg-surface rounded-2xl p-4 flex flex-col gap-1">
                  <span className="text-xs text-[#4a4f5e]">{m.label}</span>
                  <span className="text-sm font-bold text-white leading-tight">
                    {formatQ(m.patrimonio)}
                  </span>
                  <span className={`text-xs font-semibold ${m.growth >= 0 ? 'text-success' : 'text-danger'}`}>
                    {m.growth >= 0 ? '+' : ''}{m.growth}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
