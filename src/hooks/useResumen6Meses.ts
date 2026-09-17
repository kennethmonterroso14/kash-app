import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { MESES, ahoraGT } from '../lib/constants'

export interface ResumenMes {
  mes: string      // abreviatura, ej: "Oct"
  mesKey: string   // YYYY-MM
  ingresos: number // centavos
  gastos: number   // centavos (positivo)
}

export function useResumen6Meses(userId: string | undefined) {
  const [data, setData] = useState<ResumenMes[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    let ignorar = false

    // Ventana de los últimos 6 meses, anclada al calendario de Guatemala
    const now = ahoraGT()
    const keys: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const desde = `${keys[0]}-01`
    // Límite superior EXCLUSIVO: primer día del mes siguiente. Siempre es una
    // fecha válida (a diferencia de concatenar "-31", que Postgres rechaza en
    // los meses de 30 días y en febrero) y rueda bien de diciembre a enero.
    const sig = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const hastaExcl = `${sig.getFullYear()}-${String(sig.getMonth() + 1).padStart(2, '0')}-01`

    supabase
      .from('transacciones')
      .select('fecha, cantidad, tipo')
      .eq('user_id', userId)
      .gte('fecha', desde)
      .lt('fecha', hastaExcl)
      .then(({ data: rows, error: qError }) => {
        if (ignorar) return
        if (qError) {
          // Un query fallido no puede parecer "no hay historial"
          setError(qError.message)
          setLoading(false)
          return
        }
        setError(null)

        const map: Record<string, { ingresos: number; gastos: number }> = {}
        keys.forEach(k => { map[k] = { ingresos: 0, gastos: 0 } })

        ;(rows ?? []).forEach(t => {
          const key = t.fecha.substring(0, 7)
          if (!map[key]) return
          if (t.tipo === 'ingreso') map[key].ingresos += t.cantidad
          // gasto_tc también es gasto, igual que en calcEstadisticasMes.
          // pago_tc NO lo es: solo traslada deuda.
          if (t.tipo === 'gasto' || t.tipo === 'gasto_tc') {
            map[key].gastos += Math.abs(t.cantidad)
          }
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

    return () => { ignorar = true }
  }, [userId])

  return { data, loading, error }
}
