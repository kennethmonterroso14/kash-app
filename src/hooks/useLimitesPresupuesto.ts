import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSesion } from '../context/sesion'

export interface LimitePresupuesto {
  categoria: string
  monto_limite: number   // centavos
}

/**
 * Los límites de presupuesto de un mes, SOLO LECTURA — para los anillos de
 * Resumen.
 *
 * No es `usePresupuestos`, a propósito: ese hook copia los presupuestos del mes
 * anterior cuando el mes pedido está vacío, y montarlo en Resumen haría que
 * pasear el selector de mes escribiera en la base. Mirar no escribe.
 *
 * Un fallo no se pinta como "sin presupuestos": se expone en `error` y la
 * página decide callar la sección.
 */
export function useLimitesPresupuesto(userId: string, mes: string) {
  const { generacionTxns } = useSesion()
  const [estado, setEstado] = useState<{ mes: string; rows: LimitePresupuesto[]; error: string | null }>(
    { mes: '', rows: [], error: null },
  )

  useEffect(() => {
    if (!userId) return
    let ignorar = false
    const mesInicio = `${mes}-01`
    supabase
      .from('presupuestos')
      .select('categoria, monto_limite')
      .eq('user_id', userId)
      .eq('mes', mesInicio)
      .eq('activo', true)
      .then(({ data, error }) => {
        if (ignorar) return
        setEstado({ mes, rows: error ? [] : (data ?? []), error: error ? error.message : null })
      })
    return () => { ignorar = true }
  }, [userId, mes, generacionTxns])

  // Mientras llega el mes nuevo no se muestran los límites del anterior.
  const vigente = estado.mes === mes
  return {
    limites: vigente ? estado.rows : [],
    cargando: !vigente,
    error: vigente ? estado.error : null,
  }
}
