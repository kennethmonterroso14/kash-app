// src/hooks/useCategorias.ts
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO, CAT_COLORS } from '../lib/constants'

// Palette for auto-assigning colors to new user categories
const PALETTE = [
  '#f97316', '#84cc16', '#06b6d4', '#ec4899', '#8b5cf6',
  '#14b8a6', '#f59e0b', '#ef4444', '#3b82f6', '#22c55e',
  '#d946ef', '#0ea5e9', '#a3e635', '#fb7185', '#4ade80',
]

export interface CategoriaUsuario {
  id: string
  nombre: string
  tipo: 'gasto' | 'ingreso' | 'ambos'
  color: string
}

export function useCategorias(userId: string) {
  const [custom, setCustom] = useState<CategoriaUsuario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!userId) return
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('categorias_usuario')
        .select('id, nombre, tipo, color')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      setCustom(data ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar categorías')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { cargar() }, [cargar])

  // Merged lists: base + user-defined
  const categoriasGasto = useMemo(() => {
    const userGasto = custom
      .filter(c => c.tipo === 'gasto' || c.tipo === 'ambos')
      .map(c => c.nombre)
    return [...CATEGORIAS_GASTO, ...userGasto]
  }, [custom])

  const categoriasIngreso = useMemo(() => {
    const userIngreso = custom
      .filter(c => c.tipo === 'ingreso' || c.tipo === 'ambos')
      .map(c => c.nombre)
    return [...CATEGORIAS_INGRESO, ...userIngreso]
  }, [custom])

  // Merged color map: base + user-defined
  const coloresCategorias = useMemo(() => {
    const colors = { ...CAT_COLORS }
    custom.forEach(c => { colors[c.nombre] = c.color })
    return colors
  }, [custom])

  // Add a new user category. Auto-picks color from palette if not provided.
  const agregarCategoria = async (
    nombre: string,
    tipo: 'gasto' | 'ingreso' | 'ambos',
    color?: string
  ) => {
    const autoColor = color ?? PALETTE[custom.length % PALETTE.length]
    const { error } = await supabase
      .from('categorias_usuario')
      .insert({ user_id: userId, nombre: nombre.trim(), tipo, color: autoColor })
    if (error) throw new Error(`Error al agregar categoría: ${error.message}`)
    await cargar()
  }

  // Delete a user category by id.
  const eliminarCategoria = async (id: string) => {
    const { error } = await supabase
      .from('categorias_usuario')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) throw new Error(`Error al eliminar categoría: ${error.message}`)
    await cargar()
  }

  return {
    categoriasGasto,
    categoriasIngreso,
    coloresCategorias,
    custom,           // raw user categories (for management UI)
    loading,
    error,
    agregarCategoria,
    eliminarCategoria,
  }
}
