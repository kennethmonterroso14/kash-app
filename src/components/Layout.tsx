import { NavLink } from 'react-router-dom'
import AlertasBanner from './AlertasBanner'

interface Props {
  children: React.ReactNode
  onSignOut: () => void
  userId: string
}

const NAV = [
  { to: '/dashboard', label: 'Dashboard',   icon: '◈' },
  { to: '/txns',      label: 'Movimientos', icon: '≡' },
  { to: '/cuentas',   label: 'Cuentas',     icon: '◎' },
  { to: '/budget',    label: 'Presupuesto', icon: '◧' },
  { to: '/perfil',    label: 'Perfil',      icon: '◐' },
]

export default function Layout({ children, onSignOut, userId }: Props) {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <header className="bg-surface border-b border-muted/20 px-4 py-3 flex justify-between items-center">
        <span className="text-accent font-display font-bold text-xl">Vorta</span>
        <button
          onClick={onSignOut}
          className="text-muted text-sm hover:text-white transition-colors"
        >
          Salir
        </button>
      </header>

      {/* Alertas globales */}
      <AlertasBanner userId={userId} />

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-24">
        {children}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-muted/20 flex">
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-3 gap-0.5 text-xs transition-colors ${
                isActive ? 'text-accent' : 'text-muted'
              }`
            }
          >
            <span className="text-lg leading-none">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
