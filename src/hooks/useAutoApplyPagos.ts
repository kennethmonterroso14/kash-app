import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { hoyGT } from '../lib/constants'

/**
 * Runs once per session when userId is available.
 * For each active pago_recurrente where:
 *   - dia_del_mes <= today's day (GT)
 *   - ultima_aplicacion is null OR < first day of current month
 * → inserts a gasto transaction and updates ultima_aplicacion
 */
export function useAutoApplyPagos(userId: string | undefined) {
  const applied = useRef(false)

  useEffect(() => {
    if (!userId || applied.current) return
    applied.current = true

    const today = hoyGT()                        // YYYY-MM-DD
    const todayDay = parseInt(today.split('-')[2], 10)
    const mesPrefix = today.substring(0, 7)      // YYYY-MM
    const primerDiaMes = `${mesPrefix}-01`

    supabase
      .from('pagos_recurrentes')
      .select('id, nombre, monto, dia_del_mes, cuenta_id, categoria, ultima_aplicacion')
      .eq('user_id', userId)
      .eq('activo', true)
      .then(async ({ data: pagos }) => {
        if (!pagos?.length) return

        const vencidos = pagos.filter(p => {
          if (p.dia_del_mes > todayDay) return false
          if (!p.ultima_aplicacion) return true
          return p.ultima_aplicacion < primerDiaMes
        })

        if (!vencidos.length) return

        // Build transaction rows
        const txnFecha = today
        const rows = vencidos.map(p => ({
          user_id: userId,
          cuenta_id: p.cuenta_id,
          fecha: txnFecha,
          cantidad: -p.monto,   // gasto → negativo
          descripcion: p.nombre,
          categoria: p.categoria,
          tipo: 'gasto' as const,
        }))

        const { error: txnError } = await supabase
          .from('transacciones')
          .insert(rows)

        if (txnError) {
          console.error('[AutoApply] Error insertando transacciones:', txnError.message)
          return
        }

        // Update ultima_aplicacion for each applied pago
        await Promise.all(
          vencidos.map(p =>
            supabase
              .from('pagos_recurrentes')
              .update({ ultima_aplicacion: txnFecha })
              .eq('id', p.id)
          )
        )
      })
  }, [userId])
}
