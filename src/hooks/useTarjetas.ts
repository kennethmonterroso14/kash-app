// src/hooks/useTarjetas.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { calcResumenTC, calcFechasCiclo, type TarjetaCredito } from '../lib/finanzas'

export type { TarjetaCredito }

export function useTarjetas(userId: string) {
  const [tarjetas, setTarjetas] = useState<TarjetaCredito[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('tarjetas_credito')
        .select('id, nombre, banco, ultimos_4, limite_credito, deuda_actual, deuda_ciclo_anterior, dia_cierre, dia_pago, color, activa')
        .eq('user_id', userId)
        .eq('activa', true)
        .order('created_at')
      if (error) throw error
      setTarjetas(data ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar tarjetas')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { cargar() }, [cargar])

  const agregarTC = async (input: {
    nombre: string
    banco?: string
    ultimos_4?: string
    limite_credito: number    // centavos
    dia_cierre: number
    dia_pago: number
    color?: string
  }) => {
    if (!input.nombre.trim())                            throw new Error('El nombre es requerido')
    if (input.limite_credito <= 0)                       throw new Error('El límite debe ser mayor a Q0')
    if (input.dia_cierre < 1 || input.dia_cierre > 31)  throw new Error('Día de cierre inválido')
    if (input.dia_pago   < 1 || input.dia_pago   > 31)  throw new Error('Día de pago inválido')

    const { data, error } = await supabase
      .from('tarjetas_credito')
      .insert({ ...input, user_id: userId })
      .select('id, nombre, banco, ultimos_4, limite_credito, deuda_actual, deuda_ciclo_anterior, dia_cierre, dia_pago, color, activa')
      .single()
    if (error) throw new Error(`Error al guardar: ${error.message}`)
    setTarjetas(prev => [...prev, data])
    return data
  }

  const actualizarTC = async (id: string, updates: {
    nombre?: string
    banco?: string
    ultimos_4?: string
    limite_credito?: number   // centavos
    dia_cierre?: number
    dia_pago?: number
    color?: string
  }) => {
    if (updates.nombre !== undefined && !updates.nombre.trim())            throw new Error('El nombre es requerido')
    if (updates.limite_credito !== undefined && updates.limite_credito <= 0) throw new Error('El límite debe ser mayor a Q0')
    if (updates.dia_cierre !== undefined && (updates.dia_cierre < 1 || updates.dia_cierre > 31)) throw new Error('Día de cierre inválido')
    if (updates.dia_pago   !== undefined && (updates.dia_pago   < 1 || updates.dia_pago   > 31)) throw new Error('Día de pago inválido')

    const { data, error } = await supabase
      .from('tarjetas_credito')
      .update(updates)
      .eq('id', id)
      .select('id, nombre, banco, ultimos_4, limite_credito, deuda_actual, deuda_ciclo_anterior, dia_cierre, dia_pago, color, activa')
      .single()
    if (error) throw new Error(`Error al actualizar: ${error.message}`)
    setTarjetas(prev => prev.map(tc => tc.id === id ? data : tc))
    return data
  }

  const archivarTC = async (id: string) => {
    const { count } = await supabase
      .from('transacciones')
      .select('id', { count: 'exact', head: true })
      .eq('tarjeta_id', id)
    if ((count ?? 0) > 0) {
      const { error } = await supabase.from('tarjetas_credito').update({ activa: false }).eq('id', id)
      if (error) throw new Error(`Error al archivar: ${error.message}`)
    } else {
      const { error } = await supabase.from('tarjetas_credito').delete().eq('id', id)
      if (error) throw new Error(`Error al eliminar: ${error.message}`)
    }
    setTarjetas(prev => prev.filter(tc => tc.id !== id))
  }

  const cerrarCiclo = async (tcId: string) => {
    const { error } = await supabase.rpc('cerrar_ciclo_tc', { p_tarjeta_id: tcId })
    if (error) throw new Error(`Error al cerrar ciclo: ${error.message}`)
    await cargar()
  }

  // Registrar un cargo en la TC.
  // Auto-crea el ciclo abierto si no existe para esta TC.
  const registrarCargo = async (input: {
    tarjeta_id: string
    monto: number        // centavos, positivo
    descripcion: string
    categoria: string
    fecha: string
  }) => {
    // 1. Buscar la TC para obtener dia_cierre y dia_pago
    const tc = tarjetas.find(t => t.id === input.tarjeta_id)
    if (!tc) throw new Error('Tarjeta no encontrada')

    // 2. Buscar ciclo abierto para esta TC
    const { data: ciclosAbiertos, error: cicloErr } = await supabase
      .from('ciclos_tc')
      .select('id')
      .eq('tarjeta_id', input.tarjeta_id)
      .eq('estado', 'abierto')
      .limit(1)
    if (cicloErr) throw new Error(`Error al buscar ciclo: ${cicloErr.message}`)

    let cicloId: string

    if (ciclosAbiertos && ciclosAbiertos.length > 0) {
      // Ciclo abierto existe — reutilizarlo
      cicloId = ciclosAbiertos[0].id
    } else {
      // Crear ciclo nuevo automáticamente
      const fechas = calcFechasCiclo(tc.dia_cierre, tc.dia_pago)
      const { data: nuevoCiclo, error: createErr } = await supabase
        .from('ciclos_tc')
        .insert({
          tarjeta_id:   input.tarjeta_id,
          user_id:      userId,
          fecha_inicio: fechas.fecha_inicio,
          fecha_cierre: fechas.fecha_cierre,
          fecha_pago:   fechas.fecha_pago,
          estado:       'abierto',
        })
        .select('id')
        .single()
      if (createErr) throw new Error(`Error al crear ciclo: ${createErr.message}`)
      cicloId = nuevoCiclo.id
    }

    // 3. Insertar la transacción con ciclo_id
    const { error } = await supabase
      .from('transacciones')
      .insert({
        user_id:     userId,
        tarjeta_id:  input.tarjeta_id,
        ciclo_id:    cicloId,
        cantidad:    -Math.abs(input.monto),
        descripcion: input.descripcion,
        categoria:   input.categoria,
        tipo:        'gasto_tc',
        fecha:       input.fecha,
      })
    if (error) throw new Error(`Error al registrar cargo: ${error.message}`)
    await cargar()
  }

  // Registrar un pago de TC desde una cuenta bancaria (pago_tc)
  // Debita la cuenta bancaria Y reduce deuda_ciclo_anterior (vía trigger)
  const registrarPago = async (input: {
    tarjeta_id: string
    monto: number        // centavos, positivo
    cuenta_id: string
    fecha: string
  }) => {
    const { error } = await supabase
      .from('transacciones')
      .insert({
        user_id:     userId,
        cuenta_id:   input.cuenta_id,
        tarjeta_id:  input.tarjeta_id,
        cantidad:    -Math.abs(input.monto),   // negativo = sale de la cuenta
        descripcion: 'Pago tarjeta de crédito',
        categoria:   'Pago Deudas',
        tipo:        'pago_tc',
        fecha:       input.fecha,
      })
    if (error) throw new Error(`Error al registrar pago: ${error.message}`)
    await cargar()
  }

  const resumenTCs = tarjetas.map(tc => ({
    tc,
    resumen: calcResumenTC(tc),
  }))

  const totalDeuda = tarjetas.reduce(
    (s, tc) => s + tc.deuda_actual + tc.deuda_ciclo_anterior, 0
  )

  return {
    tarjetas,
    resumenTCs,
    totalDeuda,
    loading,
    error,
    agregarTC,
    actualizarTC,
    archivarTC,
    cerrarCiclo,
    registrarCargo,
    registrarPago,
    recargar: cargar,
  }
}
