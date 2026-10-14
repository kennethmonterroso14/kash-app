import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSesion } from '../context/sesion'
import { estaDesactualizado } from '../lib/tipoCambio'

/**
 * El tipo de cambio del dólar: `profiles.tipo_cambio_usd`, centavos de la
 * moneda del perfil por US$1 (775 = Q7.75). Es UNO para toda la app: convierte
 * las inversiones en dólares y las cuentas en dólares, así que cambiarlo mueve
 * el patrimonio del Resumen.
 *
 * Vivía dentro de `useInversiones`; salió de ahí cuando las cuentas también
 * pasaron a poder ser en dólares. El perfil es del contexto de sesión: guardar
 * invalida ese slice y todas las cifras convertidas se recalculan.
 */
export function useTipoCambio() {
  const { userId, perfil, error, refrescar } = useSesion()
  const tipoCambioUSD = perfil.tipo_cambio_usd
  // Si el perfil no cargó, la fecha queda en null y la UI lo marca "sin
  // verificar" en lugar de presentar el default como vigente.
  const tipoCambioFecha = error.perfil ? null : perfil.tipo_cambio_actualizado_at
  // El reloj se lee una vez, al montar: leerlo en cada render lo vuelve impuro.
  const [montadoEn] = useState(() => Date.now())
  const desactualizado = estaDesactualizado(tipoCambioFecha, montadoEn)

  /** Guarda el tipo de cambio a mano. `centavos` > 0 (775 = Q7.75). */
  const guardar = useCallback(async (centavos: number) => {
    if (!Number.isInteger(centavos) || centavos <= 0) throw new Error('El tipo de cambio debe ser mayor a 0')
    const { error: e } = await supabase
      .from('profiles')
      .update({ tipo_cambio_usd: centavos, tipo_cambio_actualizado_at: new Date().toISOString() })
      .eq('user_id', userId)
    if (e) throw new Error('No se pudo guardar el tipo de cambio. Revisa tu conexión e intenta de nuevo.')
    await refrescar.perfil()
  }, [userId, refrescar])

  /**
   * "Usar el tipo de cambio de hoy": lo consulta en exchangerate-api.com (sin
   * clave, sin mandar ningún dato del usuario; ver la política de privacidad) y
   * lo guarda. Solo corre cuando la persona toca el botón.
   */
  const consultarAPI = useCallback(async (): Promise<number> => {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
    if (!res.ok) throw new Error('No se pudo consultar el tipo de cambio de hoy. Intenta más tarde o ponlo a mano.')
    const json = await res.json() as { rates?: Record<string, number> }
    const tasa = json.rates?.[perfil.moneda]
    if (!tasa || tasa <= 0) throw new Error(`La consulta no trajo el tipo de cambio de ${perfil.moneda}. Ponlo a mano.`)
    const centavos = Math.round(tasa * 100)
    await guardar(centavos)
    return centavos
  }, [guardar, perfil.moneda])

  return { tipoCambioUSD, tipoCambioFecha, desactualizado, guardar, consultarAPI }
}
