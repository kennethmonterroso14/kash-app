import { useState } from 'react'
import { Link } from 'react-router-dom'
import Aviso from '../components/Aviso'
import { supabase } from '../lib/supabase'
import Campo from '../components/Campo'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setInfo('Revisa tu correo para confirmar tu cuenta.')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / título */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-accent font-display">Vorta</h1>
          <p className="text-textDim text-sm mt-1">Finanzas personales · Guatemala</p>
        </div>

        <div className="bg-surface rounded-2xl p-6">
          {/* Tabs */}
          <div className="flex gap-1 bg-bg rounded-xl p-1 mb-6">
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); setInfo('') }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === m ? 'bg-accent text-bg' : 'text-textDim hover:text-text'
                }`}
              >
                {m === 'login' ? 'Entrar' : 'Crear cuenta'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Campo
              etiqueta="Correo" tipo="email" required
              autoComplete="email" placeholder="tu@correo.com"
              value={email} onChange={e => setEmail(e.target.value)}
            />
            <Campo
              etiqueta="Contraseña" tipo="password" required minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)}
            />

            {error && (
              <Aviso>{error}</Aviso>
            )}
            {info && (
              <p className="text-accent text-sm bg-accent/10 rounded-xl px-4 py-2">{info}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-bg font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Cargando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>

          {/* Se puede leer antes de crear la cuenta: aceptar algo que no se
              puede abrir no es aceptar nada. */}
          <p className="text-textDim text-xs text-center mt-6 tracking-micro">
            Al crear una cuenta aceptás los{' '}
            <Link to="/ajustes/terminos" className="text-textDim underline hover:text-text">
              términos
            </Link>{' '}
            y la{' '}
            <Link to="/ajustes/privacidad" className="text-textDim underline hover:text-text">
              política de privacidad
            </Link>.
          </p>
        </div>
      </div>
    </div>
  )
}
