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

// Transacción de TC tal como se atribuye a un ciclo.
interface TxnAtribuible {
  ciclo_id: string | null
  tipo: string
  cantidad: number       // centavos
  fecha: string
}

type CicloRango = { id: string; fecha_inicio: string; fecha_cierre: string }

// Un cargo (gasto_tc) siempre trae ciclo_id. Los pagos registrados antes de que
// registrarPago empezara a enlazarlos vienen con ciclo_id null: se atribuyen al
// ciclo cuyo rango cubre su fecha, comparando strings 'YYYY-MM-DD' (sin Date,
// para no arrastrar la zona del navegador).
function perteneceAlCiclo(
  txn: { ciclo_id: string | null; fecha: string },
  ciclo: CicloRango
): boolean {
  if (txn.ciclo_id) return txn.ciclo_id === ciclo.id
  return txn.fecha >= ciclo.fecha_inicio && txn.fecha <= ciclo.fecha_cierre
}

// Suma en centavos de |cantidad| de las transacciones de un tipo en el ciclo.
function totalPorTipo(txns: TxnAtribuible[], ciclo: CicloRango, tipo: string): number {
  return txns.reduce(
    (s, t) => (t.tipo === tipo && perteneceAlCiclo(t, ciclo) ? s + Math.abs(t.cantidad) : s),
    0
  )
}

export function useCiclosTC(userId: string, tarjetaId: string) {
  const [ciclos, setCiclos]   = useState<CicloTC[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!tarjetaId) return
    try {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('ciclos_tc')
        .select('id, tarjeta_id, user_id, fecha_inicio, fecha_cierre, fecha_pago, saldo_final, estado, cerrado_at')
        .eq('tarjeta_id', tarjetaId)
        .eq('user_id', userId)
        .order('fecha_inicio', { ascending: false })
      if (error) throw new Error(error.message)
      // total_cargos / total_pagos no se seleccionan: se sobreescriben abajo.
      const filas = (data ?? []) as CicloTC[]

      // ciclos_tc.total_cargos y .total_pagos no tienen ningún writer (ni
      // trigger, ni RPC, ni cliente): siempre valen 0. Los totales se derivan
      // de las transacciones de la tarjeta, que sí son la fuente de verdad.
      const { data: txnsData, error: txnsErr } = await supabase
        .from('transacciones')
        .select('ciclo_id, tipo, cantidad, fecha')
        .eq('tarjeta_id', tarjetaId)
        .eq('user_id', userId)
        .in('tipo', ['gasto_tc', 'pago_tc'])
      if (txnsErr) throw new Error(txnsErr.message)
      const txns = (txnsData ?? []) as TxnAtribuible[]

      setCiclos(filas.map(c => ({
        ...c,
        total_cargos: totalPorTipo(txns, c, 'gasto_tc'),
        total_pagos:  totalPorTipo(txns, c, 'pago_tc'),
      })))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar ciclos')
    } finally {
      setLoading(false)
    }
  }, [userId, tarjetaId])

  useEffect(() => { cargar() }, [cargar])

  // Fetch lazy: transacciones de un ciclo específico (llamado al abrir el modal).
  // Se filtra por tarjeta y no por ciclo_id en la query, porque los pagos
  // antiguos no traen ciclo_id y se atribuyen por rango de fechas.
  const fetchTransaccionesCiclo = async (cicloId: string): Promise<TransaccionCiclo[]> => {
    const ciclo = ciclos.find(c => c.id === cicloId)
    const { data, error } = await supabase
      .from('transacciones')
      .select('id, fecha, cantidad, descripcion, categoria, tipo, ciclo_id')
      .eq('tarjeta_id', ciclo?.tarjeta_id ?? tarjetaId)
      .eq('user_id', userId)
      .in('tipo', ['gasto_tc', 'pago_tc'])
      .order('fecha', { ascending: false })
    if (error) throw new Error(`Error al cargar transacciones: ${error.message}`)
    const filas = (data ?? []) as Array<TransaccionCiclo & { ciclo_id: string | null }>
    if (!ciclo) return filas.filter(t => t.ciclo_id === cicloId)
    return filas.filter(t => perteneceAlCiclo(t, ciclo))
  }

  return { ciclos, loading, error, fetchTransaccionesCiclo, recargar: cargar }
}
