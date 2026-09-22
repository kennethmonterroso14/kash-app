import { Link, useLocation, useNavigate } from 'react-router-dom'
import AlertasBanner from './AlertasBanner'
import BotonNuevoMovimiento from './BotonNuevoMovimiento'
import {
  IconoResumen, IconoMovimientos, IconoTarjetas, IconoPatrimonio, IconoPlan,
} from './iconos'

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
  { to: '/resumen',    label: 'Resumen',     Icono: IconoResumen,    end: true },
  { to: '/txns',       label: 'Movimientos', Icono: IconoMovimientos },
  { to: '/tarjetas',   label: 'Tarjetas',    Icono: IconoTarjetas },
  // `conPestanas` cambia el aria-current a "location": en una sección con
  // pestañas la página la marca la pestaña, y dos elementos reclamando "page"
  // le deja al lector de pantalla dos respuestas a la misma pregunta.
  { to: '/patrimonio', label: 'Patrimonio',  Icono: IconoPatrimonio, conPestanas: true },
  { to: '/plan',       label: 'Plan',        Icono: IconoPlan,       conPestanas: true },
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
      {/*
        Header FLOTANTE: vidrio nuevo, fijo, con el contenido pasando por
        debajo. Es `fixed` (no `sticky`) para que la cápsula de abajo y él
        compartan lenguaje —dos capas de vidrio suspendidas sobre el contenido—;
        el `main` compensa con padding arriba y abajo.
      */}
      <header className="fixed top-0 inset-x-0 z-30 vidrio-flotante segura-arriba">
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

      {/*
        Padding arriba = alto del header + safe area; abajo = alto de la barra
        flotante (cápsula/FAB ~56) + su separación del borde + un respiro, todo
        más la safe area. Un solo lugar para las 13 páginas y el riel de pestañas
        (SeccionConPestanas), que es el elemento más alto en las rutas con
        pestañas: derivarlo por página dejaría a esas cinco metidas bajo el header.
      */}
      <main className="pt-[calc(3.25rem+env(safe-area-inset-top,0px))] pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
        {/* Alertas globales: full-bleed, dentro del flujo, así que scrollean con
            el contenido y aparecer/desaparecer no descuadra ninguna capa fija. */}
        <AlertasBanner userId={userId} />
        {children}
      </main>

      {/*
        Barra flotante: la cápsula del nav y el FAB, misma fila, despegadas de
        los bordes. El contenedor es `pointer-events-none` para que los toques
        pasen por los huecos a los lados; cada pieza reactiva su propio
        `pointer-events-auto`.
      */}
      <div className="fixed inset-x-0 z-30 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] px-3 flex items-center justify-center gap-2 pointer-events-none">
        <nav
          aria-label="Navegación principal"
          className="pointer-events-auto vidrio-flotante rounded-full flex items-center gap-0.5 p-1.5 min-w-0"
        >
          {NAV.map(({ to, label, Icono, end, conPestanas }) => {
            const activa = esActiva(to, end)
            return (
              <Link
                key={to}
                to={to}
                aria-current={activa ? (conPestanas ? 'location' : 'page') : undefined}
                aria-label={label}
                title={label}
                className={`presionable flex items-center h-11 rounded-full transition-colors duration-rapida ease-salida ${
                  // El activo puede encogerse (min-w-0) y su etiqueta trunca antes
                  // que empujar al FAB: así nunca se solapan, ni en un teléfono de
                  // 320px. Los inactivos son shrink-0 para que los iconos no se
                  // apachurren. Cinco etiquetas + FAB no caben; por eso solo el
                  // activo muestra texto (los demás llevan aria-label).
                  activa ? 'bg-accent/15 text-accent gap-1.5 px-2.5 min-w-0' : 'text-textDim px-1.5 shrink-0'
                }`}
              >
                <Icono size={22} className="shrink-0" />
                {activa && (
                  <span className="text-[12px] font-medium tracking-micro truncate">
                    {label}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <BotonNuevoMovimiento userId={userId} />
      </div>
    </div>
  )
}
