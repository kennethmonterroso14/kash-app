import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import SetupPage from './pages/SetupPage'
import DashboardPage from './pages/DashboardPage'
import TransaccionesPage from './pages/TransaccionesPage'
import CuentasPage from './pages/CuentasPage'
import BudgetPage from './pages/BudgetPage'
import MetasPage from './pages/MetasPage'
import ProyeccionesPage from './pages/ProyeccionesPage'
import PerfilPage from './pages/PerfilPage'
import PagosRecurrentesPage from './pages/PagosRecurrentesPage'
import CategoriasPage from './pages/CategoriasPage'
import TarjetasPage from './pages/TarjetasPage'
import TarjetaHistorialPage from './pages/TarjetaHistorialPage'
import InversionesPage from './pages/InversionesPage'
import { useAutoApplyPagos } from './hooks/useAutoApplyPagos'
import { SesionProvider } from './context/SesionProvider'

export default function App() {
  const { user, loading, signOut } = useAuth()
  useAutoApplyPagos(user?.id)
  // Etiquetado con el userId al que corresponde, para derivar el estado del gate
  // en lugar de reiniciarlo desde el efecto al cambiar de usuario.
  const [setup, setSetup] = useState<{ userId: string; value: boolean | 'error' } | null>(null)

  // El onboarding se completa escribiendo `profiles`, así que el gate consulta
  // esa fila — no el conteo de `cuentas`, que SetupPage nunca crea.
  // Depende de user?.id (no del objeto) para no re-evaluarse en cada TOKEN_REFRESHED.
  const userId = user?.id
  const hasSetup = setup && setup.userId === userId ? setup.value : null

  useEffect(() => {
    if (!userId) return
    let ignore = false
    supabase
      .from('profiles')
      .select('nombre')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (ignore) return
        // Un error de red no debe mandar a un usuario establecido al onboarding
        setSetup({ userId, value: error ? 'error' : !!data })
      })
    return () => { ignore = true }
  }, [userId])

  if (loading || (user && hasSetup === null)) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <p className="text-accent font-display text-lg animate-pulse">Vorta</p>
      </div>
    )
  }

  if (!user) return <LoginPage />

  if (hasSetup === 'error') {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-4">
        <div className="bg-surface rounded-2xl p-6 max-w-sm text-center space-y-3">
          <p className="text-white font-semibold">No se pudo cargar tu perfil</p>
          <p className="text-muted text-sm">
            Revisa tu conexión e intenta de nuevo. No se hizo ningún cambio en tus datos.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full bg-accent text-bg font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (!hasSetup) {
    return <SetupPage user={user} onComplete={() => setSetup({ userId: user.id, value: true })} />
  }

  // El provider envuelve TODO lo que hay detrás del gate de auth, así que
  // cualquier página puede usar useSesion(). Perfil, cuentas, categorías y
  // tarjetas se cargan una vez acá en lugar de una vez por página.
  return (
    <SesionProvider userId={user.id}>
      <Layout onSignOut={signOut} userId={user.id}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage user={user} />} />
          <Route path="/txns" element={<TransaccionesPage user={user} />} />
          <Route path="/cuentas" element={<CuentasPage />} />
          <Route path="/budget" element={<BudgetPage userId={user.id} />} />
          <Route path="/metas" element={<MetasPage />} />
          <Route path="/proyecciones" element={<ProyeccionesPage />} />
          <Route path="/pagos" element={<PagosRecurrentesPage />} />
          <Route path="/tarjetas" element={<TarjetasPage userId={user.id} />} />
          <Route path="/tarjetas/:id/historial" element={<TarjetaHistorialPage />} />
          <Route path="/inversiones" element={<InversionesPage userId={user.id} />} />
          <Route path="/perfil" element={<PerfilPage user={user} onSignOut={signOut} />} />
          <Route path="/categorias" element={<CategoriasPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>
    </SesionProvider>
  )
}
