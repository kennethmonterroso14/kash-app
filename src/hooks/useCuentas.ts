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

  useEffect(() => {
    if (!userId) return
    supabase
      .from('cuentas')
      .select('id, nombre, tipo, saldo, color, activa')
      .eq('user_id', userId)
      .eq('activa', true)
      .order('created_at')
      .then(({ data }) => {
        setCuentas(data ?? [])
        setLoading(false)
      })
  }, [userId])

  const totalPatrimonio = cuentas.reduce((sum, c) => sum + c.saldo, 0)

  return { cuentas, loading, totalPatrimonio }
}
