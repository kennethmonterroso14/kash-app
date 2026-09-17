import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface Cuenta {
  id: string
  nombre: string
  tipo: string
  saldo: number   // centavos
  color: string
  activa: boolean
}

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

  return { cuentas, loading, error, totalPatrimonio, recargar }
}
