import { useEffect, useState } from 'react'
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

  useEffect(() => {
    if (!userId) return
    let ignorar = false
    supabase
      .from('cuentas')
      .select('id, nombre, tipo, saldo, color, activa')
      .eq('user_id', userId)
      .eq('activa', true)
      .order('created_at')
      .then(({ data, error: qError }) => {
        if (ignorar) return
        if (qError) {
          // Un query fallido no es "sin cuentas": no vaciamos la lista y
          // exponemos el error para que la página no muestre Q0.00 como hecho.
          setError(qError.message)
        } else {
          setError(null)
          setCuentas(data ?? [])
        }
        setLoading(false)
      })
    return () => { ignorar = true }
  }, [userId])

  const totalPatrimonio = cuentas.reduce((sum, c) => sum + c.saldo, 0)

  return { cuentas, loading, error, totalPatrimonio }
}
