// src/hooks/useInversiones.ts
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  type Inversion,
  type InversionHistorial,
  calcResumenPortafolio,
  computeEvolucionPortafolio,
} from '../lib/finanzas'
import { hoyGT } from '../lib/constants'
import { useSesion } from '../context/sesion'

export type { Inversion, InversionHistorial }

// Agrega la pista de migración cuando el error viene de una tabla/columna
// inexistente. PostgREST usa dos redacciones distintas según el caso.
const conHintMigracion = (msg: string): string =>
  msg.includes('does not exist') || msg.includes('Could not find the table')
    ? `${msg} — ¿Ejecutaste la migración SQL de Fase 7 en Supabase?`
    : msg

export function useInversiones(userId: string) {
  // El tipo de cambio vive en `profiles`, y de eso ya es dueño el contexto de
  // sesión. Antes este hook lo consultaba por su cuenta, que era una de las
  // seis consultas duplicadas a esa tabla.
  const { perfil, error: erroresSesion, refrescar } = useSesion()
  const tipoCambioUSD = perfil.tipo_cambio_usd
  // Si el perfil no cargó, la fecha queda en null y la UI marca el tipo de
  // cambio como "sin verificar" en lugar de presentar el default como vigente.
  const tipoCambioFecha = erroresSesion.perfil ? null : perfil.tipo_cambio_actualizado_at
  const [inversiones, setInversiones]         = useState<Inversion[]>([])
  const [historial, setHistorial]             = useState<InversionHistorial[]>([])
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [invRes, histRes] = await Promise.all([
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
      ])
      if (invRes.error) throw new Error(`inversiones: ${invRes.error.message}`)
      // Las inversiones se comprometen ANTES de cualquier throw: el historial
      // solo alimenta la gráfica, así que si falla degradamos la gráfica pero
      // no borramos la lista (el patrimonio neto seguiría siendo correcto).
      setInversiones(invRes.data ?? [])
      if (histRes.error) {
        setHistorial([])
        setError(conHintMigracion(`historial: ${histRes.error.message}`))
      } else {
        setHistorial(histRes.data ?? [])
      }
    } catch (e: unknown) {
      const msg = e instanceof Error
        ? e.message
        : (e as { message?: string })?.message ?? 'Error al cargar inversiones'
      setError(conHintMigracion(msg))
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
    // Sin esto, una inversión con fecha_inicio futura deja "Actualizar valor"
    // imposible de satisfacer: actualizarValor exige fecha <= hoy y
    // fecha >= fecha_inicio a la vez.
    if (input.fecha_inicio > hoyGT()) throw new Error('La fecha de inicio no puede ser futura')

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
    if (histErr) {
      // El par insert(inversiones) + insert(historial) no es atómico desde el
      // cliente: si el segundo falla, compensamos borrando la inversión recién
      // creada. Sin esto un reintento del usuario duplicaría la inversión.
      const { error: delErr } = await supabase.from('inversiones').delete().eq('id', data.id)
      await cargar()   // reconverge el estado local con la DB
      throw new Error(delErr
        ? `Error al registrar historial: ${histErr.message}. No se pudo deshacer la inversión (${delErr.message}): revísala en la lista antes de reintentar.`
        : `Error al registrar historial: ${histErr.message}`)
    }

    await cargar()   // refresca inversiones + historial
  }

  const actualizarValor = async (id: string, nuevoValor: number, fecha: string) => {
    if (nuevoValor < 0) throw new Error('El valor no puede ser negativo')
    if (fecha > hoyGT()) throw new Error('La fecha no puede ser futura')
    const inv = inversiones.find(i => i.id === id)
    if (inv && fecha < inv.fecha_inicio) {
      throw new Error('La fecha no puede ser anterior al inicio de la inversión')
    }

    // 1. El historial es la fuente de verdad: un punto por fecha. Si ya existe
    //    un punto en esa fecha lo reemplazamos (corrección), en lugar de
    //    insertar un duplicado que dejaría la gráfica indeterminada.
    const { data: existente, error: selErr } = await supabase
      .from('inversiones_historial')
      .select('id')
      .eq('inversion_id', id)
      .eq('user_id', userId)
      .eq('fecha', fecha)
      .maybeSingle()
    if (selErr) throw new Error(`Error en historial: ${selErr.message}`)

    if (existente) {
      const { error: histUpdErr } = await supabase
        .from('inversiones_historial')
        .update({ valor: nuevoValor })
        .eq('id', existente.id)
      if (histUpdErr) throw new Error(`Error en historial: ${histUpdErr.message}`)
    } else {
      const { error: histErr } = await supabase
        .from('inversiones_historial')
        .insert({ inversion_id: id, user_id: userId, valor: nuevoValor, fecha })
      if (histErr) throw new Error(`Error en historial: ${histErr.message}`)
    }

    // 2. valor_actual / fecha_ultimo_update son una proyección del punto más
    //    reciente del historial: así registrar un valor retroactivo agrega un
    //    punto al pasado sin borrar la valuación vigente.
    //    Se acota a puntos NO futuros: un único punto con fecha futura (los
    //    había antes de validar la fecha) dejaba valor_actual clavado para
    //    siempre, porque ya no se puede escribir un punto posterior.
    const { data: ultimo, error: ultErr } = await supabase
      .from('inversiones_historial')
      .select('valor, fecha')
      .eq('inversion_id', id)
      .eq('user_id', userId)
      .lte('fecha', hoyGT())
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (ultErr) throw new Error(`Error en historial: ${ultErr.message}`)

    const { error: updErr } = await supabase
      .from('inversiones')
      .update({
        valor_actual:        ultimo?.valor ?? nuevoValor,
        fecha_ultimo_update: ultimo?.fecha ?? fecha,
      })
      .eq('id', id)
    if (updErr) throw new Error(`Error al actualizar: ${updErr.message}`)

    await cargar()   // el valor vigente lo decide la DB, no un optimistic update
  }

  const archivarInversion = async (id: string) => {
    const { error } = await supabase
      .from('inversiones')
      .update({ activa: false })
      .eq('id', id)
    if (error) throw new Error(`Error al archivar: ${error.message}`)
    setInversiones(prev => prev.filter(i => i.id !== id))
  }

  const actualizarInversion = async (id: string, updates: {
    nombre?: string
    plataforma?: string
    tipo?: string
    monto_invertido?: number   // centavos en la moneda de la inversión
    fecha_inicio?: string
    notas?: string
  }) => {
    if (updates.nombre !== undefined && !updates.nombre.trim()) throw new Error('El nombre es requerido')
    if (updates.monto_invertido !== undefined && updates.monto_invertido <= 0) throw new Error('El capital debe ser mayor a 0')
    // El `max` del input es solo un atributo: el modal no es un <form>, así que
    // no bloquea nada por sí solo.
    if (updates.fecha_inicio !== undefined && updates.fecha_inicio > hoyGT()) {
      throw new Error('La fecha de inicio no puede ser futura')
    }

    // Si cambia el capital y el valor_actual === capital original (nunca actualizado),
    // también actualizar valor_actual para mantener coherencia
    const invActual = inversiones.find(i => i.id === id)
    const dbUpdates: Record<string, unknown> = { ...updates }
    if (updates.monto_invertido !== undefined && invActual && invActual.valor_actual === invActual.monto_invertido) {
      dbUpdates.valor_actual = updates.monto_invertido
    }

    // Si se reescribe valor_actual hay que corregir también el primer punto del
    // historial (el de fecha_inicio), o la gráfica queda contradiciendo al
    // resumen. Se hace ANTES del update de inversiones: así un fallo deja todo
    // sin tocar y el reintento es limpio.
    const nuevoValorInicial = dbUpdates.valor_actual as number | undefined
    // También hay que mover el punto si cambia fecha_inicio: si no, queda
    // varado en una fecha que ya no es el inicio, y el `min` del modal de
    // "Actualizar valor" lo vuelve incorregible.
    const mueveInicio =
      invActual && updates.fecha_inicio !== undefined && updates.fecha_inicio !== invActual.fecha_inicio
    if (invActual && (nuevoValorInicial !== undefined || mueveInicio)) {
      const cambios: Record<string, unknown> = {}
      if (nuevoValorInicial !== undefined) cambios.valor = nuevoValorInicial
      if (mueveInicio) cambios.fecha = updates.fecha_inicio

      // Si ya hay un punto en la fecha destino, se fusiona en lugar de crear
      // dos puntos para el mismo día (la gráfica quedaría indeterminada).
      const colision = mueveInicio
        ? (await supabase
            .from('inversiones_historial')
            .select('id')
            .eq('inversion_id', id)
            .eq('user_id', userId)
            .eq('fecha', updates.fecha_inicio!)
            .maybeSingle()).data
        : null

      if (colision) {
        const { error: delErr } = await supabase
          .from('inversiones_historial')
          .delete()
          .eq('inversion_id', id)
          .eq('user_id', userId)
          .eq('fecha', invActual.fecha_inicio)
        if (delErr) throw new Error(`Error al sincronizar historial: ${delErr.message}`)
        if (nuevoValorInicial !== undefined) {
          const { error: updColErr } = await supabase
            .from('inversiones_historial')
            .update({ valor: nuevoValorInicial })
            .eq('id', colision.id)
          if (updColErr) throw new Error(`Error al sincronizar historial: ${updColErr.message}`)
        }
      } else {
        const { error: histErr } = await supabase
          .from('inversiones_historial')
          .update(cambios)
          .eq('inversion_id', id)
          .eq('user_id', userId)
          .eq('fecha', invActual.fecha_inicio)
        if (histErr) throw new Error(`Error al sincronizar historial: ${histErr.message}`)
      }

      // La fecha de "Actualizado" no debe quedar antes del inicio.
      if (mueveInicio && invActual.fecha_ultimo_update === invActual.fecha_inicio) {
        dbUpdates.fecha_ultimo_update = updates.fecha_inicio
      }
    }

    const { data, error } = await supabase
      .from('inversiones')
      .update(dbUpdates)
      .eq('id', id)
      .select('id, nombre, plataforma, tipo, monto_invertido, valor_actual, moneda, fecha_inicio, fecha_ultimo_update, notas, activa')
      .single()
    if (error) throw new Error(`Error al actualizar: ${error.message}`)
    setInversiones(prev => prev.map(i => i.id === id ? data : i))
    await cargar()   // refresca también el historial (la gráfica)
    return data
  }

  const actualizarTipoCambio = async (nuevoCambio: number) => {
    // nuevoCambio: centavos GTQ por 1 USD (ej: 775 = Q7.75)
    if (nuevoCambio <= 0) throw new Error('El tipo de cambio debe ser mayor a 0')
    const ahora = new Date().toISOString()

    const { error } = await supabase
      .from('profiles')
      .update({ tipo_cambio_usd: nuevoCambio, tipo_cambio_actualizado_at: ahora })
      .eq('user_id', userId)
    if (error) throw new Error(`Error al actualizar tipo de cambio: ${error.message}`)
    // El perfil es dueño del tipo de cambio, así que se invalida ese slice en
    // lugar de guardar una copia local que podría quedar desincronizada.
    await refrescar.perfil()
  }

  const fetchTipoCambioDesdeAPI = async (): Promise<number> => {
    // Usa la API gratuita de exchangerate-api.com (sin API key, GTQ incluido)
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
    if (!res.ok) throw new Error('No se pudo conectar a la API de tipo de cambio')
    const json = await res.json() as { rates: Record<string, number> }
    const rateGTQ = json.rates['GTQ']
    if (!rateGTQ || rateGTQ <= 0) throw new Error('GTQ no disponible en la API')
    // Convertir a centavos (ej: 7.75 → 775)
    const centavos = Math.round(rateGTQ * 100)
    await actualizarTipoCambio(centavos)
    return centavos
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
    actualizarInversion,
    fetchTipoCambioDesdeAPI,
    recargar: cargar,
  }
}
