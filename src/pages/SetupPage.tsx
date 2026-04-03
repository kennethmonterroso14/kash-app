import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface Props {
  user: User
  onComplete: () => void
}

export default function SetupPage({ user, onComplete }: Props) {
  const [nombre, setNombre] = useState(user.email?.split('@')[0] ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return
    setLoading(true)
    setError('')

    const { error: profileError } = await supabase.from('profiles').upsert({
      user_id: user.id,
      nombre: nombre.trim(),
      moneda: 'GTQ',
    }, { onConflict: 'user_id' })

    if (profileError) {
      setError(profileError.message)
      setLoading(false)
      return
    }

    onComplete()
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-accent font-display">Vorta</h1>
          <p className="text-muted text-sm mt-1">Bienvenido</p>
        </div>

        <div className="bg-surface rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-1">¿Cómo te llamamos?</h2>
          <p className="text-muted text-sm mb-5">
            Luego agregas tus cuentas desde la sección de Cuentas.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-muted mb-1">Tu nombre</label>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                required
                placeholder="Kenneth"
                className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            {error && (
              <p className="text-danger text-sm bg-danger/10 rounded-xl px-4 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-bg font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Empezar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
