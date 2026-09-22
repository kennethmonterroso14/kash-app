import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useSesion } from '../context/sesion'
import { useFechas } from './useFechas'

const COLS = 'id, cuenta_id, fecha, cantidad, descripcion, categoria, tipo, notas, tarjeta_id, ciclo_id, created_at'

/**
 * Escritor de `transacciones` SIN estado propio. Es el gemelo de las funciones
 * de `useTransacciones`, pero sin la lista ni el fetch del mes: lo usa el `+`
 * global, que puede aparecer sobre cualquier pantalla y no tiene una lista suya
 * que actualizar de forma optimista.
 *
 * En vez de montar `useTransacciones` (que dispararía una consulta del mes
 * entero solo para tener estas dos funciones —y el Dashboard, que es la ruta de
 * inicio, ya la dispara—), acá se inserta y se invalida. La invalidación de la
 * generación (`invalidarTxns`) es lo que hace que la lista y la gráfica que SÍ
 * están en pantalla se vuelvan a consultar. Los saldos se invalidan por la misma
 * razón que en `useTransacciones`: los mueve un trigger del servidor.
 *
 * Las firmas son idénticas a las de `useTransacciones` a propósito, para que
 * `ModalNuevoMovimiento` reciba unas u otras sin distinguir.
 */
export function useEscribirTxn(userId: string | undefined) {
  const fechas = useFechas()
  const { refrescar, invalidarTxns } = useSesion()
  const invalidar = useCallback(async () => {
    await refrescar.cuentas()
    invalidarTxns()
  }, [refrescar, invalidarTxns])

  const addTxn = useCallback(async (txn: {
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
      .select(COLS)
      .single()
    if (!error) await invalidar()
    return { data, error }
  }, [userId, fechas, invalidar])

  const addTransferencia = useCallback(async (params: {
    deCuentaId: string
    aCuentaId: string
    cantidad: number   // centavos, positivo
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
    if (!error) await invalidar()
    return { data, error }
  }, [userId, invalidar])

  return { addTxn, addTransferencia }
}
