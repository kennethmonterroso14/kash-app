import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { decidirBajaCuenta } from '../lib/bajaCuenta'
import type { MonedaCuenta } from '../lib/finanzas'

export interface Cuenta {
  id: string
  nombre: string
  tipo: string
  saldo: number   // centavos de SU moneda
  color: string
  activa: boolean
  /** Moneda de la cuenta: el saldo y todos sus movimientos están en ella. */
  moneda: MonedaCuenta
}

/**
 * Lo editable de una cuenta. El saldo NO: lo mueve el trigger (usar un ajuste).
 * Cambiar la moneda re-etiqueta la cuenta: los números no se convierten.
 */
export interface CambiosCuenta {
  nombre: string
  tipo: string
  color: string
  moneda?: MonedaCuenta
}

const COLUMNAS = 'id, nombre, tipo, saldo, color, activa'

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
  // TODAS las cuentas, también las archivadas: no se muestran, pero sus
  // movimientos siguen en el historial y para sumarlos hay que saber su moneda.
  const [todas, setTodas] = useState<Cuenta[]>([])
  // false = la base todavía no tiene `cuentas.moneda` (migración sin aplicar):
  // todo es quetzales y la app no ofrece elegir moneda.
  const [monedaDisponible, setMonedaDisponible] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Contador de generación en lugar de un flag `ignorar` por efecto: así se
  // descarta tanto la respuesta de un userId viejo como la de un `recargar`
  // que quedó atrás cuando se dispararon dos seguidos. Gana la última llamada.
  const genRef = useRef(0)

  const recargar = useCallback(async () => {
    if (!userId) return
    const gen = ++genRef.current
    const leer = (columnas: string) => supabase
      .from('cuentas')
      .select(columnas)
      .eq('user_id', userId)
      .order('created_at')
    let { data, error: qError } = await leer(`${COLUMNAS}, moneda`)
    // Como `profiles.acento`: una base sin la migración de la moneda no tumba
    // las cuentas. Se relee sin la columna y todas quedan en quetzales.
    const sinColumna = !!qError && /moneda/.test(qError.message)
    if (sinColumna) ({ data, error: qError } = await leer(COLUMNAS))
    if (gen !== genRef.current) return
    if (qError) {
      // Un query fallido no es "sin cuentas": no vaciamos la lista y
      // exponemos el error para que la página no muestre Q0.00 como hecho.
      setError(qError.message)
    } else {
      setError(null)
      setMonedaDisponible(!sinColumna)
      setTodas(((data ?? []) as unknown as Partial<Cuenta>[]).map(c => ({
        ...(c as Cuenta),
        moneda: c.moneda === 'USD' ? 'USD' : 'GTQ',
      })))
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

  // Las que se muestran y se eligen: las activas. El total en quetzales lo
  // calcula el provider, que es el que tiene el tipo de cambio del perfil.
  const cuentas = useMemo(() => todas.filter(c => c.activa), [todas])
  const monedas = useMemo(
    () => Object.fromEntries(todas.map(c => [c.id, c.moneda])) as Record<string, MonedaCuenta>,
    [todas],
  )

  /** Devuelve el mensaje de error para mostrar, o null si salió bien. */
  const actualizarCuenta = useCallback(async (id: string, cambios: CambiosCuenta): Promise<string | null> => {
    if (!userId) return ERROR_GENERICO
    const fila = {
      nombre: cambios.nombre.trim(), tipo: cambios.tipo, color: cambios.color,
      // Sin la columna no se manda: el update entero fallaría por ella.
      ...(cambios.moneda && monedaDisponible && { moneda: cambios.moneda }),
    }
    const { error: e } = await supabase.from('cuentas').update(fila).eq('id', id).eq('user_id', userId)
    if (e) return ERROR_GENERICO
    setTodas(prev => prev.map(c => (c.id === id ? { ...c, ...fila } : c)))
    return null
  }, [userId, monedaDisponible])

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
    // Archivada sigue en `todas` (su historial necesita su moneda); borrada no.
    setTodas(prev => hecho === 'borrada'
      ? prev.filter(c => c.id !== id)
      : prev.map(c => (c.id === id ? { ...c, activa: false } : c)))
    return { ok: hecho }
  }, [userId])

  return { cuentas, monedas, monedaDisponible, loading, error, recargar, actualizarCuenta, eliminarCuenta }
}
