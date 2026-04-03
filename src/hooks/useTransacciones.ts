import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { hoyGT } from '../lib/constants'

export interface Transaccion {
  id: string
  cuenta_id: string
  fecha: string
  cantidad: number   // centavos
  descripcion: string
  categoria: string
  tipo: 'ingreso' | 'gasto' | 'ajuste'
  notas?: string
}

export function useTransacciones(userId: string | undefined, mes: string) {
  const [txns, setTxns] = useState<Transaccion[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTxns = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const desde = `${mes}-01`
    const hasta = `${mes}-31`
    const { data } = await supabase
      .from('transacciones')
      .select('id, cuenta_id, fecha, cantidad, descripcion, categoria, tipo, notas')
      .eq('user_id', userId)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    setTxns(data ?? [])
    setLoading(false)
  }, [userId, mes])

  useEffect(() => { fetchTxns() }, [fetchTxns])

  const addTxn = async (txn: {
    cuenta_id: string
    cantidad: number
    descripcion: string
    categoria: string
    tipo: 'ingreso' | 'gasto' | 'ajuste'
    fecha?: string
    notas?: string
  }) => {
    if (!userId) return { error: 'Sin usuario' }
    const { data, error } = await supabase
      .from('transacciones')
      .insert({ ...txn, user_id: userId, fecha: txn.fecha ?? hoyGT() })
      .select()
      .single()
    if (!error && data) {
      setTxns(prev => [data, ...prev])
    }
    return { data, error }
  }

  const deleteTxn = async (id: string) => {
    const { error } = await supabase.from('transacciones').delete().eq('id', id)
    if (!error) {
      setTxns(prev => prev.filter(t => t.id !== id))
    }
    return { error }
  }

  const restoreTxn = async (txn: Transaccion) => {
    if (!userId) return { error: 'Sin usuario' }
    const { data, error } = await supabase
      .from('transacciones')
      .insert({ ...txn, user_id: userId })
      .select()
      .single()
    if (!error && data) {
      setTxns(prev => [data, ...prev].sort((a, b) => b.fecha.localeCompare(a.fecha)))
    }
    return { data, error }
  }

  const updateTxn = async (id: string, updates: {
    cantidad: number
    descripcion: string
    categoria: string
    fecha: string
  }) => {
    const { data, error } = await supabase
      .from('transacciones')
      .update(updates)
      .eq('id', id)
      .select('id, cuenta_id, fecha, cantidad, descripcion, categoria, tipo, notas')
      .single()
    if (!error && data) {
      setTxns(prev => prev.map(t => t.id === id ? { ...t, ...data } : t))
    }
    return { data, error }
  }

  return { txns, loading, addTxn, deleteTxn, restoreTxn, updateTxn, refresh: fetchTxns }
}
