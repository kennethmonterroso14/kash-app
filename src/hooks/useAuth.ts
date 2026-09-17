import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user ?? null
      // Cada evento (TOKEN_REFRESHED, SIGNED_IN por recuperación entre pestañas)
      // trae un objeto nuevo. Conservar la identidad mientras sea el mismo usuario
      // evita re-renders y re-ejecuciones de efectos en toda la app.
      setUser(prev => (prev?.id === next?.id ? prev : next))
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = () => supabase.auth.signOut()

  return { user, loading, signOut }
}
