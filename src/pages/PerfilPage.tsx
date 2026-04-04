import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface Props {
  user: { id: string; email?: string | null }
  onSignOut: () => void
}

export default function PerfilPage({ user, onSignOut }: Props) {
  const navigate = useNavigate()
  const [nombre, setNombre] = useState<string | null>(null)
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('nombre')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.nombre) setNombre(data.nombre)
      })
  }, [user.id])

  const firstLetter = (user.email ?? 'U')[0].toUpperCase()
  const displayName = nombre ?? user.email ?? 'Usuario'


  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Avatar */}
      <div className="flex flex-col items-center gap-3 mt-4 mb-8">
        <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center">
          <span className="text-accent text-2xl font-bold">{firstLetter}</span>
        </div>
        <div className="text-center">
          <p className="text-white font-semibold text-lg">{displayName}</p>
          {nombre && user.email && (
            <p className="text-muted text-sm mt-0.5">{user.email}</p>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-muted/20 mb-6" />

      {/* Navigation shortcuts */}
      <div className="flex flex-col gap-2 mb-6">
        {[
          { to: '/inversiones',  icon: '📈', label: 'Inversiones' },
          { to: '/tarjetas',     icon: '💳', label: 'Tarjetas de Crédito' },
          { to: '/pagos',        icon: '↻', label: 'Pagos Fijos' },
          { to: '/metas',        icon: '◉', label: 'Metas de ahorro' },
          { to: '/proyecciones', icon: '⟳', label: 'Proyecciones' },
        ].map(({ to, icon, label }) => (
          <button
            key={to}
            onClick={() => navigate(to)}
            className="w-full flex items-center justify-between px-4 py-3 bg-surface rounded-xl hover:opacity-80 transition-opacity"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{icon}</span>
              <span className="text-white text-sm font-medium">{label}</span>
            </div>
            <span className="text-muted text-sm">›</span>
          </button>
        ))}
      </div>

      <div className="border-t border-muted/20 mb-6" />

      {/* Sign out section */}
      <div className="flex flex-col gap-3">
        {!confirmSignOut ? (
          <button
            onClick={() => setConfirmSignOut(true)}
            className="w-full py-3 rounded-xl bg-danger/10 text-danger font-semibold text-sm hover:bg-danger/20 transition-colors"
          >
            Cerrar sesión
          </button>
        ) : (
          <>
            <button
              onClick={onSignOut}
              className="w-full py-3 rounded-xl bg-danger text-white font-semibold text-sm hover:bg-danger/90 transition-colors"
            >
              ¿Confirmar cierre de sesión?
            </button>
            <button
              onClick={() => setConfirmSignOut(false)}
              className="text-muted text-sm text-center hover:text-white transition-colors"
            >
              Cancelar
            </button>
          </>
        )}
      </div>

      {/* Version */}
      <p className="text-muted text-xs text-center mt-12">Vorta v2.0</p>
    </div>
  )
}
