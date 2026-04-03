import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface PagoRecurrente {
  id: string
  nombre: string
  monto: number        // centavos
  dia_del_mes: number  // 1-28
  cuenta_id: string
  categoria: string
  activo: boolean
  ultima_aplicacion: string | null  // date YYYY-MM-DD
}

export function usePagosRecurrentes(userId: string | undefined) {
  const [pagos, setPagos] = useState<PagoRecurrente[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    supabase
      .from('pagos_recurrentes')
      .select('id, nombre, monto, dia_del_mes, cuenta_id, categoria, activo, ultima_aplicacion')
      .eq('user_id', userId)
      .eq('activo', true)
      .order('dia_del_mes')
      .then(({ data }) => {
        setPagos(data ?? [])
        setLoading(false)
      })
  }, [userId])

  const addPago = async (pago: Omit<PagoRecurrente, 'id' | 'activo' | 'ultima_aplicacion'>) => {
    if (!userId) return { error: 'Sin usuario' }
    const { data, error } = await supabase
      .from('pagos_recurrentes')
      .insert({ ...pago, user_id: userId })
      .select('id, nombre, monto, dia_del_mes, cuenta_id, categoria, activo, ultima_aplicacion')
      .single()
    if (!error && data) setPagos(prev => [...prev, data].sort((a, b) => a.dia_del_mes - b.dia_del_mes))
    return { data, error }
  }

  const updatePago = async (id: string, updates: Partial<Pick<PagoRecurrente, 'nombre' | 'monto' | 'dia_del_mes' | 'cuenta_id' | 'categoria'>>) => {
    const { error } = await supabase
      .from('pagos_recurrentes')
      .update(updates)
      .eq('id', id)
    if (!error) {
      setPagos(prev =>
        prev.map(p => p.id === id ? { ...p, ...updates } : p)
            .sort((a, b) => a.dia_del_mes - b.dia_del_mes)
      )
    }
    return { error }
  }

  const deletePago = async (id: string) => {
    const { error } = await supabase
      .from('pagos_recurrentes')
      .update({ activo: false })
      .eq('id', id)
    if (!error) setPagos(prev => prev.filter(p => p.id !== id))
    return { error }
  }

  return { pagos, loading, addPago, updatePago, deletePago }
}
