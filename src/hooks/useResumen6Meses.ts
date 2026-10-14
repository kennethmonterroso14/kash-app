import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { MESES } from '../lib/constants'
import { useFechas } from './useFechas'
import { useSesion } from '../context/sesion'
import { esGastoComputable } from '../lib/finanzas'
import { useMonedas } from './useMonedas'

export interface ResumenMes {
  mes: string      // abreviatura, ej: "Oct"
  mesKey: string   // YYYY-MM
  ingresos: number // centavos
  gastos: number   // centavos (positivo)
}

interface FilaMes { fecha: string; cantidad: number; tipo: string; cuenta_id: string | null }

export function useResumen6Meses(userId: string | undefined) {
  // Las fechas salen de la zona del usuario. Este hook se monta desde una
  // página, o sea dentro del SesionProvider, así que puede leer el perfil.
  const fechas = useFechas()
  // Sin esto no había NINGUNA forma de invalidarlo: solo se salvaba porque
  // DashboardPage remonta al navegar. Un `+` global escribiendo mientras se ve
  // el Dashboard lo dejaba viejo.
  const { generacionTxns } = useSesion()
  // Las filas crudas se guardan y se suman aparte: si cambia el tipo de cambio
  // o la moneda de una cuenta, el resumen se recalcula sin volver a consultar.
  const { monedaDe, enBase } = useMonedas()
  const [crudo, setCrudo] = useState<{ keys: string[]; filas: FilaMes[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    let ignorar = false

    // Ventana de los últimos 6 meses, anclada al calendario del usuario.
    const now = fechas.ahora()
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
      .select('fecha, cantidad, tipo, cuenta_id')
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
        setCrudo({ keys, filas: (rows ?? []) as FilaMes[] })
        setLoading(false)
      })

    return () => { ignorar = true }
    // `fechas` es estable (useMemo por zona): esto se re-consulta si cambia el
    // usuario, su zona, o la generación de transacciones (un write en cualquier
    // parte, incluido el `+` global).
  }, [userId, fechas, generacionTxns])

  const data = useMemo<ResumenMes[]>(() => {
    if (!crudo) return []
    const map: Record<string, { ingresos: number; gastos: number }> = {}
    crudo.keys.forEach(k => { map[k] = { ingresos: 0, gastos: 0 } })

    crudo.filas.forEach(t => {
      const key = t.fecha.substring(0, 7)
      if (!map[key]) return
      // En quetzales: lo de una cuenta en dólares entra convertido.
      const valor = enBase(t.cantidad, monedaDe(t.cuenta_id))
      if (t.tipo === 'ingreso') map[key].ingresos += valor
      // gasto_tc también es gasto, igual que en calcEstadisticasMes.
      // pago_tc NO lo es: solo traslada deuda.
      if (esGastoComputable(t.tipo)) map[key].gastos += Math.abs(valor)
    })

    return crudo.keys.map(k => {
      const [, m] = k.split('-').map(Number)
      return { mes: MESES[m - 1].substring(0, 3), mesKey: k, ingresos: map[k].ingresos, gastos: map[k].gastos }
    })
  }, [crudo, enBase, monedaDe])

  return { data, loading, error }
}
