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

/**
 * El cromo de la app son dos capas de vidrio flotando sobre el contenido, no
 * dos barras opacas que le quitan alto a la pantalla (apple-design §12): el
 * scroll vive en la ventana y el contenido pasa POR DEBAJO del header y del
 * nav, que es lo único que hace visible el desenfoque. Si el scroll volviera a
 * un `overflow-y-auto` en el `main`, el material se vería como color plano.
 */
export default function Layout({ children, onSignOut, userId }: Props) {
  return (
    <div className="min-h-dvh bg-bg">
      {/* Header: material pesado, y donde el contenido se mete debajo va un
          degradado en lugar de una línea de 1px. */}
      <header className="sticky top-0 z-30 vidrio-chrome borde-scroll-abajo segura-arriba">
        <div className="px-4 py-3 flex justify-between items-center">
          <span className="text-accent font-display font-bold text-xl tracking-titulo">Vorta</span>
          <button
            onClick={onSignOut}
            className="presionable text-textDim text-sm px-2 py-1 rounded-chip hover:text-text"
          >
            Salir
          </button>
        </div>
      </header>

      {/* Alertas globales */}
      <AlertasBanner userId={userId} />

      {/* El padding de abajo es el alto del nav más la safe area, para que el
          último elemento de cualquier página quede alcanzable. */}
      <main className="pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))]">
        {children}
      </main>

      {/* Nav: el canto superior claro es la luz pegando en el borde del vidrio. */}
      <nav className="fixed bottom-0 inset-x-0 z-30 flex vidrio-chrome canto-superior segura-abajo">
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `presionable flex-1 flex flex-col items-center py-2.5 gap-0.5 text-[11px] tracking-micro ${
                isActive ? 'text-accent' : 'text-textDim'
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
