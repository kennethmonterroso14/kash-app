import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import SeccionConPestanas from './components/SeccionConPestanas'
import LoginPage from './pages/LoginPage'
import SetupPage from './pages/SetupPage'
import DashboardPage from './pages/DashboardPage'
import TransaccionesPage from './pages/TransaccionesPage'
import CuentasPage from './pages/CuentasPage'
import BudgetPage from './pages/BudgetPage'
import MetasPage from './pages/MetasPage'
import ProyeccionesPage from './pages/ProyeccionesPage'
import AjustesPage from './pages/AjustesPage'
import PagosRecurrentesPage from './pages/PagosRecurrentesPage'
import CategoriasPage from './pages/CategoriasPage'
import TarjetasPage from './pages/TarjetasPage'
import TarjetaHistorialPage from './pages/TarjetaHistorialPage'
import InversionesPage from './pages/InversionesPage'
import AutoAplicarPagos from './components/AutoAplicarPagos'
import PoliticaPrivacidad from './pages/legal/PoliticaPrivacidad'
import Terminos from './pages/legal/Terminos'
import { SesionProvider } from './context/SesionProvider'

const PESTANAS_PATRIMONIO = [
  { to: '/patrimonio/cuentas',     label: 'Cuentas' },
  { to: '/patrimonio/inversiones', label: 'Inversiones' },
]

const PESTANAS_PLAN = [
  { to: '/plan/presupuesto',  label: 'Presupuesto' },
  { to: '/plan/metas',        label: 'Metas' },
  { to: '/plan/proyecciones', label: 'Proyecciones' },
]

export default function App() {
  const { user, loading, signOut } = useAuth()
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
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-accent font-display text-lg animate-pulse">Vorta</p>
      </div>
    )
  }

  // Los legales tienen que poder leerse ANTES de crear la cuenta: nadie acepta
  // términos que no puede abrir. Y un revisor de tienda los busca justo acá.
  // Es un Routes aparte porque el de abajo vive detrás del gate de auth.
  if (!user) {
    return (
      <Routes>
        <Route path="/ajustes/privacidad" element={<PoliticaPrivacidad />} />
        <Route path="/ajustes/terminos" element={<Terminos />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    )
  }

  if (hasSetup === 'error') {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4">
        <div className="vidrio-panel rounded-tarjeta p-6 max-w-sm text-center space-y-3">
          <p className="text-text font-semibold">No se pudo cargar tu perfil</p>
          <p className="text-textDim text-sm">
            Revisa tu conexión e intenta de nuevo. No se hizo ningún cambio en tus datos.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="presionable w-full bg-accent text-bg font-semibold py-3 rounded-control"
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
    <SesionProvider userId={user.id} email={user.email ?? null}>
      {/* Dentro del provider: necesita la zona horaria del perfil. */}
      <AutoAplicarPagos userId={user.id} />
      <Layout userId={user.id}>
        <Routes>
          <Route path="/" element={<Navigate to="/resumen" replace />} />

          {/* ── Los cinco destinos de la nav ────────────────────────── */}
          <Route path="/resumen" element={<DashboardPage />} />
          <Route path="/txns" element={<TransaccionesPage />} />
          <Route path="/tarjetas" element={<TarjetasPage />} />
          <Route path="/tarjetas/:id/historial" element={<TarjetaHistorialPage />} />

          <Route path="/patrimonio" element={<SeccionConPestanas pestanas={PESTANAS_PATRIMONIO} />}>
            <Route index element={<Navigate to="/patrimonio/cuentas" replace />} />
            <Route path="cuentas" element={<CuentasPage />} />
            <Route path="inversiones" element={<InversionesPage />} />
          </Route>

          <Route path="/plan" element={<SeccionConPestanas pestanas={PESTANAS_PLAN} />}>
            <Route index element={<Navigate to="/plan/presupuesto" replace />} />
            <Route path="presupuesto" element={<BudgetPage />} />
            <Route path="metas" element={<MetasPage />} />
            <Route path="proyecciones" element={<ProyeccionesPage />} />
          </Route>

          {/* ── Configuración: no es un destino de la nav ───────────── */}
          <Route path="/ajustes" element={<AjustesPage onSignOut={signOut} />} />
          <Route path="/ajustes/pagos" element={<PagosRecurrentesPage />} />
          <Route path="/ajustes/categorias" element={<CategoriasPage />} />

          {/*
            Rutas viejas conservadas como redirecciones: pueden estar en un
            atajo de la PWA instalada o en un bookmark, y romperlas por un
            cambio de navegación es gratuito de evitar.
          */}
          <Route path="/dashboard"    element={<Navigate to="/resumen" replace />} />
          <Route path="/cuentas"      element={<Navigate to="/patrimonio/cuentas" replace />} />
          <Route path="/inversiones"  element={<Navigate to="/patrimonio/inversiones" replace />} />
          <Route path="/budget"       element={<Navigate to="/plan/presupuesto" replace />} />
          <Route path="/metas"        element={<Navigate to="/plan/metas" replace />} />
          <Route path="/proyecciones" element={<Navigate to="/plan/proyecciones" replace />} />
          <Route path="/pagos"        element={<Navigate to="/ajustes/pagos" replace />} />
          <Route path="/categorias"   element={<Navigate to="/ajustes/categorias" replace />} />
          <Route path="/perfil"       element={<Navigate to="/ajustes" replace />} />

          <Route path="*" element={<Navigate to="/resumen" replace />} />
          {/* Legales. Fuera del riel de pestañas de Ajustes a propósito: no
              son configuración, son documentos, y aparecer como una pestaña
              más los pondría al mismo nivel que Pagos Fijos. */}
          <Route path="/ajustes/privacidad" element={<PoliticaPrivacidad />} />
          <Route path="/ajustes/terminos" element={<Terminos />} />
        </Routes>
      </Layout>
    </SesionProvider>
  )
}
