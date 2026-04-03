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

export default function App() {
  const { user, loading, signOut } = useAuth()
  const [hasSetup, setHasSetup] = useState<boolean | null>(null)

  // Verificar si el usuario ya tiene cuentas configuradas
  useEffect(() => {
    if (!user) { setHasSetup(null); return }
    supabase
      .from('cuentas')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .then(({ count }) => setHasSetup((count ?? 0) > 0))
  }, [user])

  if (loading || (user && hasSetup === null)) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <p className="text-accent font-mono text-lg animate-pulse">Kash</p>
      </div>
    )
  }

  if (!user) return <LoginPage />

  if (!hasSetup) {
    return <SetupPage user={user} onComplete={() => setHasSetup(true)} />
  }

  return (
    <Layout onSignOut={signOut}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage user={user} />} />
        <Route path="/txns" element={<TransaccionesPage user={user} />} />
        <Route path="/cuentas" element={<CuentasPage user={user} />} />
        <Route path="/budget" element={<BudgetPage user={user} />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  )
}
