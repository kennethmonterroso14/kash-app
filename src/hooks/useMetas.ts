import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface Meta {
  id: string
  nombre: string
  monto_objetivo: number   // centavos
  monto_actual: number     // centavos
  completada: boolean
  created_at: string
}

const COLS = 'id, nombre, monto_objetivo, monto_actual, completada, created_at'

/**
 * Las metas de ahorro ACTIVAS del usuario. Era otra tabla sin hook: sus
 * consultas vivían dentro de `MetasPage`.
 *
 * "Completar" no borra: pone `completada = true`, y la lista solo trae las
 * activas, así que la meta desaparece de la vista pero queda en la base. Las
 * escrituras van acotadas por `user_id` para que un id ajeno afecte 0 filas.
 */
export function useMetas(userId: string) {
  const [metas, setMetas] = useState<Meta[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [operando, setOperando] = useState(false)
  const [generacion, setGeneracion] = useState(0)

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('metas_ahorro')
      .select(COLS)
      .eq('user_id', userId)
      .eq('completada', false)
      .order('created_at', { ascending: true })
    if (err) setError(err.message)
    else { setError(null); setMetas((data as Meta[]) ?? []) }
    setCargando(false)
  }, [userId])

  useEffect(() => { cargar() }, [cargar, generacion])

  /** Devuelve el mensaje de error, o null si salió bien. */
  const agregar = async (
    nombre: string, objetivoCentavos: number, actualCentavos: number,
  ): Promise<string | null> => {
    const { data, error: err } = await supabase
      .from('metas_ahorro')
      .insert({
        user_id: userId,
        nombre,
        monto_objetivo: objetivoCentavos,
        monto_actual: actualCentavos,
      })
      .select(COLS)
      .single()
    if (err) return err.message
    if (data) setMetas(prev => [...prev, data as Meta])
    return null
  }

  const completar = async (id: string): Promise<string | null> => {
    setOperando(true)
    try {
      const { error: err } = await supabase
        .from('metas_ahorro')
        .update({ completada: true })
        .eq('id', id)
        .eq('user_id', userId)
      if (err) { setError(err.message); return err.message }
      setMetas(prev => prev.filter(m => m.id !== id))
      return null
    } finally {
      setOperando(false)
    }
  }

  const eliminar = async (id: string): Promise<string | null> => {
    setOperando(true)
    try {
      const { error: err } = await supabase
        .from('metas_ahorro')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (err) { setError(err.message); return err.message }
      setMetas(prev => prev.filter(m => m.id !== id))
      return null
    } finally {
      setOperando(false)
    }
  }

  return {
    metas, cargando, error, operando,
    agregar, completar, eliminar,
    recargar: () => setGeneracion(g => g + 1),
  }
}
