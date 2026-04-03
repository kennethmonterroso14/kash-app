import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { MESES } from '../lib/constants'

export interface ResumenMes {
  mes: string      // abreviatura, ej: "Oct"
  mesKey: string   // YYYY-MM
  ingresos: number // centavos
  gastos: number   // centavos (positivo)
}

export function useResumen6Meses(userId: string | undefined) {
  const [data, setData] = useState<ResumenMes[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return

    // Build last-6-months window
    const now = new Date()
    const keys: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const desde = `${keys[0]}-01`
    const hasta = `${keys[5]}-31`

    supabase
      .from('transacciones')
      .select('fecha, cantidad, tipo')
      .eq('user_id', userId)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .then(({ data: rows }) => {
        const map: Record<string, { ingresos: number; gastos: number }> = {}
        keys.forEach(k => { map[k] = { ingresos: 0, gastos: 0 } })

        ;(rows ?? []).forEach(t => {
          const key = t.fecha.substring(0, 7)
          if (!map[key]) return
          if (t.tipo === 'ingreso') map[key].ingresos += t.cantidad
          if (t.tipo === 'gasto')  map[key].gastos  += Math.abs(t.cantidad)
        })

        setData(keys.map(k => {
          const [, m] = k.split('-').map(Number)
          return {
            mes: MESES[m - 1].substring(0, 3),
            mesKey: k,
            ingresos: map[k].ingresos,
            gastos: map[k].gastos,
          }
        }))
        setLoading(false)
      })
  }, [userId])

  return { data, loading }
}
