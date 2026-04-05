// src/hooks/useCiclosTC.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { CicloTC } from '../lib/finanzas'

export type { CicloTC }

export interface TransaccionCiclo {
  id: string
  fecha: string
  cantidad: number       // centavos, negativo = gasto
  descripcion: string
  categoria: string
  tipo: string
}

export function useCiclosTC(userId: string, tarjetaId: string) {
  const [ciclos, setCiclos]   = useState<CicloTC[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!tarjetaId) return
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('ciclos_tc')
        .select('id, tarjeta_id, user_id, fecha_inicio, fecha_cierre, fecha_pago, total_cargos, total_pagos, saldo_final, estado')
        .eq('tarjeta_id', tarjetaId)
        .eq('user_id', userId)
        .order('fecha_inicio', { ascending: false })
      if (error) throw new Error(error.message)
      setCiclos(data ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar ciclos')
    } finally {
      setLoading(false)
    }
  }, [userId, tarjetaId])

  useEffect(() => { cargar() }, [cargar])

  // Fetch lazy: transacciones de un ciclo específico (llamado al abrir el modal)
  const fetchTransaccionesCiclo = async (cicloId: string): Promise<TransaccionCiclo[]> => {
    const { data, error } = await supabase
      .from('transacciones')
      .select('id, fecha, cantidad, descripcion, categoria, tipo')
      .eq('ciclo_id', cicloId)
      .eq('user_id', userId)
      .order('fecha', { ascending: false })
    if (error) throw new Error(`Error al cargar transacciones: ${error.message}`)
    return data ?? []
  }

  return { ciclos, loading, error, fetchTransaccionesCiclo, recargar: cargar }
}
