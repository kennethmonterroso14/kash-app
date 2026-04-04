// src/hooks/useTarjetas.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { calcResumenTC, type TarjetaCredito } from '../lib/finanzas'

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

  // Registrar un cargo en la TC (gasto_tc)
  // cuenta_id es null porque el cargo no debita ninguna cuenta bancaria aún
  const registrarCargo = async (input: {
    tarjeta_id: string
    monto: number        // centavos, positivo
    descripcion: string
    categoria: string
    fecha: string
  }) => {
    const { error } = await supabase
      .from('transacciones')
      .insert({
        user_id:     userId,
        cuenta_id:   null,
        tarjeta_id:  input.tarjeta_id,
        cantidad:    -Math.abs(input.monto),   // negativo = gasto
        descripcion: input.descripcion,
        categoria:   input.categoria,
        tipo:        'gasto_tc',
        fecha:       input.fecha,
      })
    if (error) throw new Error(`Error al registrar cargo: ${error.message}`)
    await cargar()   // refrescar deuda_actual en la card
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
    archivarTC,
    cerrarCiclo,
    registrarCargo,
    registrarPago,
    recargar: cargar,
  }
}
