import { useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useCuentas } from '../hooks/useCuentas'
import { useTransacciones } from '../hooks/useTransacciones'
import { formatQ, calcEstadisticasMes } from '../lib/finanzas'
import { CAT_COLORS, MESES, mesActual } from '../lib/constants'

interface Props { user: User }

export default function DashboardPage({ user }: Props) {
  const [mes, setMes] = useState(mesActual())
  const { cuentas, totalPatrimonio } = useCuentas(user.id)
  const { txns, loading } = useTransacciones(user.id, mes)

  const stats = useMemo(() => calcEstadisticasMes(
    txns.map(t => ({ ...t, id: t.id, descripcion: t.descripcion }))
  ), [txns])

  const [anio, mesNum] = mes.split('-').map(Number)
  const mesLabel = `${MESES[mesNum - 1]} ${anio}`

  // Top categorías de gasto
  const topCats = Object.entries(stats.porCategoria)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)

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

      {/* Selector de mes */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            const d = new Date(anio, mesNum - 2, 1)
            setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
          }}
          className="text-muted hover:text-white p-2"
        >
          ←
        </button>
        <span className="text-white font-medium">{mesLabel}</span>
        <button
          onClick={() => {
            const d = new Date(anio, mesNum, 1)
            setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
          }}
          className="text-muted hover:text-white p-2"
        >
          →
        </button>
      </div>

      {/* Stats del mes */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface rounded-2xl p-4">
          <p className="text-muted text-xs mb-1">Ingresos</p>
          <p className="text-accent font-mono font-semibold text-sm">{formatQ(stats.ingresos)}</p>
        </div>
        <div className="bg-surface rounded-2xl p-4">
          <p className="text-muted text-xs mb-1">Gastos</p>
          <p className="text-danger font-mono font-semibold text-sm">{formatQ(stats.gastos)}</p>
        </div>
        <div className="bg-surface rounded-2xl p-4">
          <p className="text-muted text-xs mb-1">Neto</p>
          <p className={`font-mono font-semibold text-sm ${stats.neto >= 0 ? 'text-accent' : 'text-danger'}`}>
            {formatQ(stats.neto)}
          </p>
        </div>
      </div>

      {/* Ahorro % */}
      {stats.ingresos > 0 && (
        <div className="bg-surface rounded-2xl p-4">
          <div className="flex justify-between mb-2">
            <span className="text-muted text-sm">Tasa de ahorro</span>
            <span className={`font-mono font-semibold text-sm ${stats.pctAhorro >= 25 ? 'text-accent' : 'text-danger'}`}>
              {stats.pctAhorro}%
            </span>
          </div>
          <div className="h-2 bg-bg rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${stats.pctAhorro >= 25 ? 'bg-accent' : 'bg-danger'}`}
              style={{ width: `${Math.min(stats.pctAhorro, 100)}%` }}
            />
          </div>
          {stats.pctAhorro < 25 && (
            <p className="text-danger text-xs mt-2">Meta mínima: 25% de ahorro</p>
          )}
        </div>
      )}

      {/* Top categorías */}
      {topCats.length > 0 && (
        <div className="bg-surface rounded-2xl p-4">
          <p className="text-muted text-xs uppercase tracking-widest mb-3">Top gastos</p>
          <div className="space-y-2">
            {topCats.map(([cat, monto]) => (
              <div key={cat} className="flex items-center gap-3">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: CAT_COLORS[cat] ?? '#6b7590' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between mb-0.5">
                    <span className="text-xs text-white truncate">{cat}</span>
                    <span className="text-xs font-mono text-muted ml-2 flex-shrink-0">{formatQ(monto)}</span>
                  </div>
                  {stats.gastos > 0 && (
                    <div className="h-1 bg-bg rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(monto / stats.gastos) * 100}%`,
                          background: CAT_COLORS[cat] ?? '#6b7590',
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <p className="text-muted text-center text-sm">Cargando...</p>
      )}

      {!loading && txns.length === 0 && (
        <div className="bg-surface rounded-2xl p-6 text-center">
          <p className="text-muted text-sm">Sin movimientos en {mesLabel}</p>
          <p className="text-muted text-xs mt-1">Agrega el primero con el botón +</p>
        </div>
      )}
    </div>
  )
}
