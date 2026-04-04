// src/hooks/useInversiones.ts
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  type Inversion,
  type InversionHistorial,
  calcResumenPortafolio,
  computeEvolucionPortafolio,
} from '../lib/finanzas'

export type { Inversion, InversionHistorial }

export function useInversiones(userId: string) {
  const [inversiones, setInversiones]         = useState<Inversion[]>([])
  const [historial, setHistorial]             = useState<InversionHistorial[]>([])
  const [tipoCambioUSD, setTipoCambioUSD]     = useState<number>(775)
  const [tipoCambioFecha, setTipoCambioFecha] = useState<string | null>(null)
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setLoading(true)
      const [invRes, histRes, perfilRes] = await Promise.all([
        supabase
          .from('inversiones')
          .select('id, nombre, plataforma, tipo, monto_invertido, valor_actual, moneda, fecha_inicio, fecha_ultimo_update, notas, activa')
          .eq('user_id', userId)
          .eq('activa', true)
          .order('created_at'),
        supabase
          .from('inversiones_historial')
          .select('id, inversion_id, valor, fecha')
          .eq('user_id', userId)
          .order('fecha'),
        supabase
          .from('profiles')
          .select('tipo_cambio_usd, tipo_cambio_actualizado_at')
          .eq('id', userId)
          .single(),
      ])
      if (invRes.error)    throw invRes.error
      if (histRes.error)   throw histRes.error
      if (perfilRes.error) throw perfilRes.error
      setInversiones(invRes.data ?? [])
      setHistorial(histRes.data ?? [])
      if (perfilRes.data) {
        setTipoCambioUSD(perfilRes.data.tipo_cambio_usd ?? 775)
        setTipoCambioFecha(perfilRes.data.tipo_cambio_actualizado_at ?? null)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar inversiones')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { cargar() }, [cargar])

  const agregarInversion = async (input: {
    nombre: string
    plataforma?: string
    tipo: string
    monto_invertido: number   // centavos en la moneda indicada
    moneda: 'GTQ' | 'USD'
    fecha_inicio: string      // 'YYYY-MM-DD'
    notas?: string
  }) => {
    if (!input.nombre.trim())       throw new Error('El nombre es requerido')
    if (input.monto_invertido <= 0) throw new Error('El capital debe ser mayor a 0')

    const { data, error } = await supabase
      .from('inversiones')
      .insert({
        ...input,
        user_id:             userId,
        valor_actual:        input.monto_invertido,   // valor inicial = capital
        fecha_ultimo_update: input.fecha_inicio,
      })
      .select('id, nombre, plataforma, tipo, monto_invertido, valor_actual, moneda, fecha_inicio, fecha_ultimo_update, notas, activa')
      .single()
    if (error) throw new Error(`Error al guardar: ${error.message}`)

    // Registrar primer punto en historial
    const { error: histErr } = await supabase.from('inversiones_historial').insert({
      inversion_id: data.id,
      user_id:      userId,
      valor:        data.valor_actual,
      fecha:        data.fecha_inicio,
    })
    if (histErr) throw new Error(`Error al registrar historial: ${histErr.message}`)

    await cargar()   // refresca inversiones + historial
  }

  const actualizarValor = async (id: string, nuevoValor: number, fecha: string) => {
    if (nuevoValor < 0) throw new Error('El valor no puede ser negativo')

    const { error: updErr } = await supabase
      .from('inversiones')
      .update({ valor_actual: nuevoValor, fecha_ultimo_update: fecha })
      .eq('id', id)
    if (updErr) throw new Error(`Error al actualizar: ${updErr.message}`)

    const { error: histErr } = await supabase
      .from('inversiones_historial')
      .insert({ inversion_id: id, user_id: userId, valor: nuevoValor, fecha })
    if (histErr) throw new Error(`Error en historial: ${histErr.message}`)

    // Optimistic update
    setInversiones(prev =>
      prev.map(i => i.id === id ? { ...i, valor_actual: nuevoValor, fecha_ultimo_update: fecha } : i)
    )
    setHistorial(prev => [
      ...prev,
      { id: crypto.randomUUID(), inversion_id: id, valor: nuevoValor, fecha },
    ])
  }

  const archivarInversion = async (id: string) => {
    const { error } = await supabase
      .from('inversiones')
      .update({ activa: false })
      .eq('id', id)
    if (error) throw new Error(`Error al archivar: ${error.message}`)
    setInversiones(prev => prev.filter(i => i.id !== id))
  }

  const actualizarTipoCambio = async (nuevoCambio: number) => {
    // nuevoCambio: centavos GTQ por 1 USD (ej: 775 = Q7.75)
    if (nuevoCambio <= 0) throw new Error('El tipo de cambio debe ser mayor a 0')
    const ahora = new Date().toISOString()
    const { error } = await supabase
      .from('profiles')
      .update({ tipo_cambio_usd: nuevoCambio, tipo_cambio_actualizado_at: ahora })
      .eq('id', userId)
    if (error) throw new Error(`Error al actualizar tipo de cambio: ${error.message}`)
    setTipoCambioUSD(nuevoCambio)
    setTipoCambioFecha(ahora)
  }

  const resumen = useMemo(
    () => calcResumenPortafolio(inversiones, tipoCambioUSD),
    [inversiones, tipoCambioUSD]
  )

  const evolucionPortafolio = useMemo(
    () => computeEvolucionPortafolio(inversiones, historial, tipoCambioUSD),
    [inversiones, historial, tipoCambioUSD]
  )

  const tieneUSD = inversiones.some(i => i.moneda === 'USD')

  return {
    inversiones,
    historial,
    resumen,
    evolucionPortafolio,
    tipoCambioUSD,
    tipoCambioFecha,
    tieneUSD,
    loading,
    error,
    agregarInversion,
    actualizarValor,
    archivarInversion,
    actualizarTipoCambio,
    recargar: cargar,
  }
}
