import { useEffect, useState, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useTransacciones } from '../hooks/useTransacciones'
import { formatQ, calcEstadoPresupuesto } from '../lib/finanzas'
import { mesActual } from '../lib/constants'

interface Props { user: User }

interface Presupuesto {
  id: string
  categoria: string
  monto_limite: number
}

export default function BudgetPage({ user }: Props) {
  const mes = mesActual()
  const { txns } = useTransacciones(user.id, mes)
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const mesInicio = `${mes}-01`
    supabase
      .from('presupuestos')
      .select('id, categoria, monto_limite')
      .eq('user_id', user.id)
      .eq('mes', mesInicio)
      .eq('activo', true)
      .then(({ data }) => {
        setPresupuestos(data ?? [])
        setLoading(false)
      })
  }, [user.id, mes])

  // Gastos por categoría del mes
  const gastadoPorCat = useMemo(() => {
    const map: Record<string, number> = {}
    txns.filter(t => t.tipo === 'gasto').forEach(t => {
      map[t.categoria] = (map[t.categoria] ?? 0) + Math.abs(t.cantidad)
    })
    return map
  }, [txns])

  if (loading) return <div className="max-w-lg mx-auto px-4 py-6"><p className="text-muted text-center">Cargando...</p></div>

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-3">
      <p className="text-muted text-xs uppercase tracking-widest mb-2">Presupuesto del mes</p>

      {presupuestos.length === 0 && (
        <div className="bg-surface rounded-2xl p-6 text-center">
          <p className="text-muted text-sm">Sin presupuestos configurados</p>
        </div>
      )}

      {presupuestos.map(p => {
        const gastado = gastadoPorCat[p.categoria] ?? 0
        const { pct, estado, restante } = calcEstadoPresupuesto(gastado, p.monto_limite)
        const barColor = estado === 'excedido' ? '#ff7c5c' : estado === 'alerta' ? '#fbbf24' : '#c8f564'

        return (
          <div key={p.id} className="bg-surface rounded-2xl p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-white text-sm font-medium">{p.categoria}</span>
              <span className={`text-xs font-mono font-semibold ${
                estado === 'excedido' ? 'text-danger' : estado === 'alerta' ? 'text-yellow-400' : 'text-accent'
              }`}>
                {pct}%
              </span>
            </div>
            <div className="h-2 bg-bg rounded-full overflow-hidden mb-2">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(pct, 100)}%`, background: barColor }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted">
              <span>{formatQ(gastado)} gastado</span>
              <span>
                {restante >= 0 ? `${formatQ(restante)} restante` : `${formatQ(Math.abs(restante))} excedido`}
              </span>
            </div>
            <div className="text-xs text-muted mt-0.5 text-right">Límite: {formatQ(p.monto_limite)}</div>
          </div>
        )
      })}
    </div>
  )
}
