import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { decidirBajaCuenta } from '../lib/bajaCuenta'

export interface Cuenta {
  id: string
  nombre: string
  tipo: string
  saldo: number   // centavos
  color: string
  activa: boolean
}

/** Lo editable de una cuenta. El saldo NO: lo mueve el trigger (usar un ajuste). */
export interface CambiosCuenta {
  nombre: string
  tipo: string
  color: string
}

/**
 * El resultado de pedir eliminar una cuenta. `bloqueada` no es un error: es la
 * regla de `decidirBajaCuenta`, y la hoja le explica al usuario qué hacer.
 */
export type ResultadoBaja =
  | { ok: 'borrada' | 'archivada' }
  | { bloqueada: 'saldo' | 'pagos_fijos' }
  | { error: string }

const ERROR_GENERICO = 'No se pudo completar. Revisa tu conexión e intenta de nuevo.'

export function useCuentas(userId: string | undefined) {
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Contador de generación en lugar de un flag `ignorar` por efecto: así se
  // descarta tanto la respuesta de un userId viejo como la de un `recargar`
  // que quedó atrás cuando se dispararon dos seguidos. Gana la última llamada.
  const genRef = useRef(0)

  const recargar = useCallback(async () => {
    if (!userId) return
    const gen = ++genRef.current
    const { data, error: qError } = await supabase
      .from('cuentas')
      .select('id, nombre, tipo, saldo, color, activa')
      .eq('user_id', userId)
      .eq('activa', true)
      .order('created_at')
    if (gen !== genRef.current) return
    if (qError) {
      // Un query fallido no es "sin cuentas": no vaciamos la lista y
      // exponemos el error para que la página no muestre Q0.00 como hecho.
      setError(qError.message)
    } else {
      setError(null)
      setCuentas(data ?? [])
    }
    setLoading(false)
  }, [userId])

  // El propio contador de generación cubre el cambio de userId: `recargar`
  // cambia de identidad, el efecto vuelve a correr, y la respuesta anterior
  // queda con un `gen` viejo y se descarta. No hace falta cleanup.
  //
  // El disable es sobre el patrón canónico de fetch-on-mount, no sobre un
  // defecto: `recargar` es async y los setState ocurren en un microtask, no
  // sincrónicamente en el efecto. useCategorias, useTarjetas y useInversiones
  // tienen exactamente esta forma y el rule NO los marca, porque su try/catch
  // derrota el análisis estático. Acá el cuerpo es lo bastante simple para que
  // lo trace, y por eso salta. `recargar` se mantiene async a propósito: el
  // provider de sesión necesita poder await-earlo después de un write.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recargar() }, [recargar])

  const totalPatrimonio = cuentas.reduce((sum, c) => sum + c.saldo, 0)

  /** Devuelve el mensaje de error para mostrar, o null si salió bien. */
  const actualizarCuenta = useCallback(async (id: string, cambios: CambiosCuenta): Promise<string | null> => {
    if (!userId) return ERROR_GENERICO
    const fila = { nombre: cambios.nombre.trim(), tipo: cambios.tipo, color: cambios.color }
    const { error: e } = await supabase.from('cuentas').update(fila).eq('id', id).eq('user_id', userId)
    if (e) return ERROR_GENERICO
    setCuentas(prev => prev.map(c => (c.id === id ? { ...c, ...fila } : c)))
    return null
  }, [userId])

  /**
   * Borra la cuenta si no tiene historial, la archiva si lo tiene, o se niega
   * con el motivo (ver `decidirBajaCuenta`). El saldo se lee de la base en el
   * momento, no del estado local: si otra pestaña movió plata, el local miente.
   */
  const eliminarCuenta = useCallback(async (id: string): Promise<ResultadoBaja> => {
    if (!userId) return { error: ERROR_GENERICO }
    const [cuenta, movs, pagos, pagosActivos] = await Promise.all([
      supabase.from('cuentas').select('saldo').eq('id', id).eq('user_id', userId).single(),
      supabase.from('transacciones').select('id', { count: 'exact', head: true }).eq('cuenta_id', id),
      supabase.from('pagos_recurrentes').select('id', { count: 'exact', head: true }).eq('cuenta_id', id),
      supabase.from('pagos_recurrentes').select('id', { count: 'exact', head: true }).eq('cuenta_id', id).eq('activo', true),
    ])
    if (cuenta.error || movs.error || pagos.error || pagosActivos.error) return { error: ERROR_GENERICO }

    const decision = decidirBajaCuenta({
      saldo: cuenta.data.saldo,
      movimientos: movs.count ?? 0,
      pagosFijos: pagos.count ?? 0,
      pagosFijosActivos: pagosActivos.count ?? 0,
    })
    if (decision.accion === 'bloquear') return { bloqueada: decision.motivo }

    let hecho: 'borrada' | 'archivada' = decision.accion === 'borrar' ? 'borrada' : 'archivada'
    if (decision.accion === 'borrar') {
      const { error: e } = await supabase.from('cuentas').delete().eq('id', id).eq('user_id', userId)
      // 23503 = foreign_key_violation: apareció un movimiento entre el conteo y
      // el borrado. Se archiva en su lugar, que es lo que habría decidido.
      if (e && e.code !== '23503') return { error: ERROR_GENERICO }
      if (e) hecho = 'archivada'
    }
    if (hecho === 'archivada') {
      const { error: e } = await supabase.from('cuentas').update({ activa: false }).eq('id', id).eq('user_id', userId)
      if (e) return { error: ERROR_GENERICO }
    }
    setCuentas(prev => prev.filter(c => c.id !== id))
    return { ok: hecho }
  }, [userId])

  return { cuentas, loading, error, totalPatrimonio, recargar, actualizarCuenta, eliminarCuenta }
}
