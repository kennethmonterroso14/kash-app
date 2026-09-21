import { Link, useLocation, useNavigate } from 'react-router-dom'
import AlertasBanner from './AlertasBanner'

interface Props {
  children: React.ReactNode
  userId: string
}

/**
 * Cinco destinos, cada uno una pregunta (tarea 3.1). La configuración NO está
 * acá: vive detrás del engranaje del header, porque es configuración y no un
 * lugar al que se va.
 *
 * `end` solo en Resumen: las otras tienen subrutas (`/patrimonio/cuentas`,
 * `/tarjetas/:id/historial`) y sin eso la pestaña activa se apagaría al entrar
 * a una de ellas.
 */
const NAV = [
  { to: '/resumen',    label: 'Resumen',     icon: '◈', end: true },
  { to: '/txns',       label: 'Movimientos', icon: '≡' },
  { to: '/tarjetas',   label: 'Tarjetas',    icon: '▭' },
  // `conPestanas` cambia el aria-current a "location": en una sección con
  // pestañas la página la marca la pestaña, y dos elementos reclamando "page"
  // le deja al lector de pantalla dos respuestas a la misma pregunta.
  { to: '/patrimonio', label: 'Patrimonio',  icon: '◎', conPestanas: true },
  { to: '/plan',       label: 'Plan',        icon: '◧', conPestanas: true },
]

export default function Layout({ children, userId }: Props) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  /**
   * Se calcula a mano en lugar de usar `NavLink` porque en React Router 7
   * `NavLink` fija `aria-current="page"` sin opción de cambiarlo, y en una
   * sección con pestañas eso deja DOS elementos contestando "¿cuál es la
   * página actual?": el item de nav y la pestaña. El nav dice `location`
   * (dónde estoy dentro del conjunto) y la pestaña dice `page`.
   */
  const esActiva = (to: string, end?: boolean) =>
    end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)

  return (
    <div className="min-h-dvh bg-bg">
      {/* Header: material pesado, y donde el contenido se mete debajo va un
          degradado en lugar de una línea de 1px. */}
      <header className="sticky top-0 z-30 vidrio-chrome borde-scroll-abajo segura-arriba">
        <div className="px-4 py-3 flex justify-between items-center">
          <span className="text-accent font-display font-bold text-xl tracking-titulo">Vorta</span>
          <button
            onClick={() => navigate('/ajustes')}
            aria-label="Ajustes"
            title="Ajustes"
            className="presionable text-textDim hover:text-text p-1 rounded-chip"
          >
            {/* Engranaje dibujado y no un emoji: el emoji cambia de forma y de
                color según la plataforma, y este es cromo, no contenido. */}
            <svg
              aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
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
        {NAV.map(({ to, label, icon, end, conPestanas }) => {
          const activa = esActiva(to, end)
          return (
            <Link
              key={to}
              to={to}
              aria-current={activa ? (conPestanas ? 'location' : 'page') : undefined}
              className={`presionable flex-1 min-w-0 flex flex-col items-center py-2.5 gap-0.5 text-[10px] tracking-micro ${
                activa ? 'text-accent' : 'text-textDim'
              }`}
            >
              <span aria-hidden="true" className="text-lg leading-none">{icon}</span>
              <span className="truncate px-0.5">{label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
