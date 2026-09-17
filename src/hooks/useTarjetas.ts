// src/hooks/useTarjetas.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { calcResumenTC, calcFechasCiclo, type TarjetaCredito } from '../lib/finanzas'
import { ahoraGT } from '../lib/constants'

export type { TarjetaCredito }

// 'YYYY-MM-DD' → día siguiente, operando sobre los campos de calendario de la
// cadena (nunca sobre `new Date()` del navegador) para no correrse de zona.
function diaSiguiente(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  const dt = new Date(a, m - 1, d + 1)       // normaliza fin de mes
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${dt.getFullYear()}-${mm}-${dd}`
}

// Date con los campos de calendario de una fecha 'YYYY-MM-DD', anclada al
// mediodía para que getFullYear/getMonth/getDate nunca se corran por DST.
function fechaCalendario(fecha: string): Date {
  const [a, m, d] = fecha.split('-').map(Number)
  return new Date(a, m - 1, d, 12, 0, 0)
}

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
      // `throw error` perdía la causa: el objeto de PostgREST no es
      // instanceof Error, así que el catch caía al mensaje genérico y el
      // motivo real (red, RLS, columna faltante) quedaba invisible.
      if (error) throw new Error(error.message)
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

  // Devuelve el ciclo abierto de la TC y lo crea si no existe.
  //
  // ciclos_tc tiene unique(tarjeta_id, fecha_inicio) y calcFechasCiclo devuelve
  // la MISMA fecha_inicio durante toda la ventana de facturación, así que si el
  // usuario cerró el ciclo antes del día de cierre esa fecha_inicio ya está
  // ocupada por el ciclo cerrado. El ciclo nuevo arranca entonces el día
  // siguiente al último cierre registrado, en vez de chocar contra la
  // constraint (y nunca se reabre un ciclo ya cerrado).
  const obtenerCicloAbierto = async (tc: TarjetaCredito): Promise<string> => {
    const { data: abiertos, error: buscarErr } = await supabase
      .from('ciclos_tc')
      .select('id')
      .eq('tarjeta_id', tc.id)
      .eq('user_id', userId)
      .eq('estado', 'abierto')
      .order('fecha_inicio', { ascending: false })
      .limit(1)
    if (buscarErr) throw new Error(`Error al buscar ciclo: ${buscarErr.message}`)
    if (abiertos && abiertos.length > 0) return abiertos[0].id

    const vigente = calcFechasCiclo(tc.dia_cierre, tc.dia_pago, ahoraGT())

    const { data: ultimos, error: ultimoErr } = await supabase
      .from('ciclos_tc')
      .select('fecha_inicio, fecha_cierre')
      .eq('tarjeta_id', tc.id)
      .eq('user_id', userId)
      .order('fecha_cierre', { ascending: false })
      .limit(1)
    if (ultimoErr) throw new Error(`Error al buscar ciclo: ${ultimoErr.message}`)

    let fechas = vigente
    const ultimo = ultimos?.[0]
    // La condición se evalúa contra el CIERRE del último ciclo, no contra su
    // inicio: lo que hay que evitar es solaparse con él. Con dia_cierre fijo
    // las dos comparaciones coinciden, pero si el usuario edita dia_cierre la
    // ventana vigente puede caer dentro del ciclo anterior con un inicio
    // todavía posterior, y se insertaba un ciclo solapado.
    if (ultimo && vigente.fecha_inicio <= ultimo.fecha_cierre) {
      const fecha_inicio = diaSiguiente(ultimo.fecha_cierre)
      // ciclo_fechas_validas exige fecha_cierre > fecha_inicio: si el inicio ya
      // rebasó el cierre de la ventana vigente, la ventana correcta es la
      // siguiente.
      const ventana = fecha_inicio >= vigente.fecha_cierre
        ? calcFechasCiclo(tc.dia_cierre, tc.dia_pago, fechaCalendario(fecha_inicio))
        : vigente
      fechas = { ...ventana, fecha_inicio }
    }

    const { data: nuevoCiclo, error: createErr } = await supabase
      .from('ciclos_tc')
      .insert({
        tarjeta_id:   tc.id,
        user_id:      userId,
        fecha_inicio: fechas.fecha_inicio,
        fecha_cierre: fechas.fecha_cierre,
        fecha_pago:   fechas.fecha_pago,
        estado:       'abierto',
      })
      .select('id')
      .single()
    if (!createErr) return nuevoCiclo.id

    // 23505 = unique_violation: otra pestaña creó el mismo ciclo en paralelo.
    // Se reutiliza si sigue abierto; nunca se le cuelgan cargos a uno cerrado.
    if (createErr.code !== '23505') throw new Error(`Error al crear ciclo: ${createErr.message}`)
    const { data: existente } = await supabase
      .from('ciclos_tc')
      .select('id, estado')
      .eq('tarjeta_id', tc.id)
      .eq('user_id', userId)
      .eq('fecha_inicio', fechas.fecha_inicio)
      .maybeSingle()
    if (existente && existente.estado === 'abierto') return existente.id
    throw new Error('No se pudo abrir un ciclo nuevo para esta tarjeta. Intenta de nuevo en un momento.')
  }

  // Atribuye un pago a un ciclo para que aparezca en el historial.
  // El trigger aplica pago_tc primero contra deuda_ciclo_anterior, o sea que el
  // pago liquida el estado de cuenta YA cerrado: se enlaza al ciclo cerrado más
  // reciente y, si no hay ninguno, al ciclo cuyo rango cubre la fecha del pago.
  // Un pago nunca abre un ciclo.
  // Atribuye el pago al ciclo que el trigger de deuda realmente va a afectar,
  // en vez de asumir el último cerrado. El trigger reparte así:
  //   v_d_ant = -least(monto, deuda_ciclo_anterior)
  //   v_d_act = -least(monto + v_d_ant, deuda_actual)
  // es decir: primero el estado de cuenta cerrado y el sobrante contra el
  // ciclo abierto. Con deuda_ciclo_anterior en 0 (lo normal cuando ya se pagó
  // el estado anterior) el pago entero cae en el ciclo ABIERTO, y marcarlo
  // contra un ciclo cerrado inflaba un estado de cuenta que no se tocó.
  const cicloDelPago = async (
    tarjetaId: string,
    fecha: string,
    monto: number,
  ): Promise<string | null> => {
    const { data, error } = await supabase
      .from('ciclos_tc')
      .select('id, estado, fecha_inicio, fecha_cierre')
      .eq('tarjeta_id', tarjetaId)
      .eq('user_id', userId)
      .order('fecha_inicio', { ascending: false })
      .limit(12)
    if (error || !data) {
      // No se bloquea el pago por esto: lo que baja la deuda es la transacción.
      // Sin ciclo_id el historial lo atribuye por rango de fechas.
      console.error('No se pudo resolver el ciclo del pago:', error)
      return null
    }

    const porRango = data.find(
      (c: { fecha_inicio: string; fecha_cierre: string }) =>
        fecha >= c.fecha_inicio && fecha <= c.fecha_cierre
    )
    const deudaAnterior = tarjetas.find(t => t.id === tarjetaId)?.deuda_ciclo_anterior ?? 0

    // Nada facturado pendiente: el pago completo baja el ciclo abierto.
    if (deudaAnterior <= 0) return porRango?.id ?? null

    // El pago se reparte entre dos ciclos: un solo ciclo_id no puede
    // expresarlo, así que se deja nulo y el historial lo resuelve por rango.
    if (monto > deudaAnterior) return null

    // Liquida (parte de) el estado de cuenta ya cerrado. Igual se prefiere el
    // rango si el pago es anterior al inicio de ese ciclo: un pago con fecha
    // previa no puede pertenecer a un estado que todavía no empezaba.
    const cerrado = data.find((c: { estado: string }) => c.estado === 'cerrado')
    if (cerrado && fecha >= cerrado.fecha_inicio) return cerrado.id
    return porRango?.id ?? null
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

    // 2. Ciclo abierto (se crea si hace falta)
    const cicloId = await obtenerCicloAbierto(tc)

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
    const cicloId = await cicloDelPago(input.tarjeta_id, input.fecha, Math.abs(input.monto))
    const { error } = await supabase
      .from('transacciones')
      .insert({
        user_id:     userId,
        cuenta_id:   input.cuenta_id,
        tarjeta_id:  input.tarjeta_id,
        ciclo_id:    cicloId,
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
