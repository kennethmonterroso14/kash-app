import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useSesion } from '../context/sesion'
import { useFechas } from './useFechas'

const COLS = 'id, cuenta_id, fecha, cantidad, descripcion, categoria, tipo, notas, tarjeta_id, ciclo_id, created_at'

export interface Transaccion {
  id: string
  cuenta_id: string | null
  fecha: string
  cantidad: number   // centavos
  descripcion: string
  categoria: string
  tipo: 'ingreso' | 'gasto' | 'ajuste' | 'gasto_tc' | 'pago_tc'
  notas?: string
  tarjeta_id?: string | null
  ciclo_id?: string | null
  created_at?: string
}

export function useTransacciones(userId: string | undefined, mes: string) {
  // Las fechas salen de la zona del usuario. Este hook se monta desde una
  // página, o sea dentro del SesionProvider, así que puede leer el perfil.
  // (La restricción de CLAUDE.md es para los hooks que el provider MONTA —
  // `useTarjetas` —; esos consumirían el contexto que ellos mismos proveen.)
  const fechas = useFechas()

  /**
   * TODA escritura en `transacciones` mueve `cuentas.saldo`: lo hace el trigger
   * `trigger_saldo_transaccion`, del lado del servidor. Y el slice de cuentas
   * vive en el `SesionProvider`, que está montado POR ENCIMA del router, así
   * que no se vuelve a montar al navegar: queda viejo hasta un reload completo.
   *
   * Eso era un bug visible: agregabas un movimiento, ibas al dashboard, y las
   * tarjetas de Patrimonio, Disponible real y Patrimonio neto seguían con el
   * saldo anterior. Las cifras del mes sí se actualizaban —`DashboardPage`
   * remonta y las vuelve a pedir— y por eso parecía que el registro "no se
   * había guardado".
   *
   * Va acá y no en cada sitio de llamada a propósito: en el sitio de llamada se
   * olvida, y es justo lo que pasó.
   */
  const { refrescar, invalidarTxns, generacionTxns } = useSesion()
  // Toda escritura invalida DOS cosas: los saldos de cuentas (los mueve el
  // trigger del servidor) y la generación de transacciones (para que otras
  // instancias del hook y el resumen de 6 meses se re-consulten — p. ej. tras
  // escribir desde el `+` global mientras se ve el Dashboard).
  const invalidar = useCallback(async () => {
    await refrescar.cuentas()
    invalidarTxns()
  }, [refrescar, invalidarTxns])
  // Guardamos el mes al que pertenecen las filas para poder descartar una
  // respuesta lenta de un mes que el usuario ya dejó atrás.
  const [state, setState] = useState<{ mes: string | null; rows: Transaccion[] }>({ mes: null, rows: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!userId) return
    let ignorar = false

    ;(async () => {
      setLoading(true)
      const desde = `${mes}-01`
      const [y, m] = mes.split('-').map(Number)
      const ultimoDia = new Date(y, m, 0).getDate()   // día 0 del mes siguiente = último día del mes actual
      const hasta = `${mes}-${String(ultimoDia).padStart(2, '0')}`
      const { data, error: qError } = await supabase
        .from('transacciones')
        .select(COLS)
        .eq('user_id', userId)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
      if (ignorar) return   // el mes cambió: esta respuesta ya no aplica
      if (qError) {
        setError(qError.message)
        setState({ mes, rows: [] })
      } else {
        setError(null)
        setState({ mes, rows: data ?? [] })
      }
      setLoading(false)
    })()

    return () => { ignorar = true }
  }, [userId, mes, recarga, generacionTxns])

  // Nunca devolvemos las filas de otro mes mientras el mes actual carga
  const txns = state.mes === mes ? state.rows : []

  const setRows = (fn: (prev: Transaccion[]) => Transaccion[]) =>
    setState(prev => ({ ...prev, rows: fn(prev.rows) }))

  const refresh = useCallback(() => setRecarga(n => n + 1), [])

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
      .insert({ ...txn, user_id: userId, fecha: txn.fecha ?? fechas.hoy() })
      .select()
      .single()
    if (!error && data) {
      setRows(prev => [data, ...prev])
      await invalidar()
    }
    return { data, error }
  }

  const deleteTxn = async (id: string) => {
    const { error } = await supabase.from('transacciones').delete().eq('id', id)
    if (!error) {
      setRows(prev => prev.filter(t => t.id !== id))
      await invalidar()
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
      setRows(prev => [data, ...prev].sort((a, b) => b.fecha.localeCompare(a.fecha)))
      await invalidar()
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
      .select(COLS)
      .single()
    if (!error && data) {
      setRows(prev => prev.map(t => t.id === id ? { ...t, ...data } : t))
      await invalidar()
    }
    return { data, error }
  }

  const addTransferencia = async (params: {
    deCuentaId: string
    aCuentaId: string
    cantidad: number   // centavos, positive
    descripcion: string
    fecha: string
  }) => {
    if (!userId) return { error: 'Sin usuario' }
    const { deCuentaId, aCuentaId, cantidad, descripcion, fecha } = params
    const base = { user_id: userId, categoria: 'Transferencia', tipo: 'ajuste' as const, descripcion, fecha }
    const { data, error } = await supabase
      .from('transacciones')
      .insert([
        { ...base, cuenta_id: deCuentaId, cantidad: -cantidad },
        { ...base, cuenta_id: aCuentaId,  cantidad: +cantidad },
      ])
      .select(COLS)
    if (!error && data) {
      setRows(prev => [...data, ...prev])
      await invalidar()
    }
    return { data, error }
  }

  return { txns, loading, error, addTxn, deleteTxn, restoreTxn, updateTxn, addTransferencia, refresh }
}
