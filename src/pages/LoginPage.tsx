import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Aviso from '../components/Aviso'
import { supabase } from '../lib/supabase'
import { googleActivado, leerErrorOAuth, mensajeErrorOAuth } from '../lib/authOAuth'
import { guardarDestino } from '../lib/volverTrasLogin'
import Campo from '../components/Campo'

/** La "G" de Google en sus cuatro colores: la marca que pide su guía para el botón. */
const LogoGoogle = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
)

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)
  const [conGoogle, setConGoogle] = useState(false)
  // Si se vuelve de Google con un error (se canceló, el proveedor falló), está
  // en la URL: se lee al montar y se limpia, para que un refresh no lo repita.
  const [error, setError] = useState(() => {
    const e = leerErrorOAuth(window.location.href)
    return e ? mensajeErrorOAuth(e) : ''
  })
  const [info, setInfo] = useState('')
  const [googleListo, setGoogleListo] = useState(false)

  useEffect(() => {
    if (leerErrorOAuth(window.location.href)) {
      window.history.replaceState(null, '', window.location.pathname)
    }
    let ignorar = false
    void googleActivado(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
      .then(activo => { if (!ignorar) setGoogleListo(activo) })
    return () => { ignorar = true }
  }, [])

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

  // Sale de la app hacia Google y vuelve al origen con la sesión en la URL;
  // el cliente de Supabase la toma solo (detectSessionInUrl) y useAuth se
  // entera por onAuthStateChange. Una cuenta nueva cae en SetupPage como
  // cualquier otra, porque todavía no tiene fila en `profiles`.
  const entrarConGoogle = async () => {
    setError('')
    setInfo('')
    setConGoogle(true)
    // Google vuelve al origen, no a esta ruta: si se llegó a una en particular
    // (el consentimiento de un asistente de IA), se retoma al volver.
    if (window.location.pathname !== '/') guardarDestino(window.location.pathname + window.location.search)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    // Si todo sale bien la página ya se está yendo; solo se llega acá con error.
    if (error) {
      setError('No se pudo abrir el inicio con Google. Intenta de nuevo.')
      setConGoogle(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / título */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-accent font-display">Vorta</h1>
          <p className="text-textDim text-sm mt-1">Finanzas personales · Guatemala</p>
        </div>

        <div className="vidrio-panel rounded-tarjeta p-6">
          {googleListo && (
            <>
              <button
                type="button"
                onClick={() => void entrarConGoogle()}
                disabled={conGoogle || loading}
                className="presionable w-full h-12 rounded-full bg-surface text-text font-semibold text-[15px] border border-canto shadow-chip inline-flex items-center justify-center gap-2.5 disabled:opacity-50"
              >
                <LogoGoogle />
                {conGoogle ? 'Abriendo Google…' : 'Continuar con Google'}
              </button>
              <div className="flex items-center gap-3 my-5" aria-hidden="true">
                <span className="flex-1 border-t border-perimetro" />
                <span className="text-textDim text-[13px]">o con tu correo</span>
                <span className="flex-1 border-t border-perimetro" />
              </div>
            </>
          )}

          {/* Entrar / Crear cuenta, con el segmentado de la app. */}
          <div className="flex gap-1 bg-vidrio-relleno rounded-full p-1 mb-5">
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(''); setInfo('') }}
                aria-pressed={mode === m}
                className={`flex-1 h-9 rounded-full text-[14px] transition-colors duration-rapida ${
                  mode === m ? 'bg-vidrio-segmento shadow-chip text-text font-semibold' : 'text-textDim font-medium hover:text-text'
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
              <p className="text-accent text-sm bg-accent/10 rounded-control px-4 py-2">{info}</p>
            )}

            <button
              type="submit"
              disabled={loading || conGoogle}
              className="presionable w-full h-12 rounded-full bg-accent text-bg font-semibold disabled:opacity-50"
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
