import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import AlertasBanner from './AlertasBanner'
import PagosPorCategorizar from './PagosPorCategorizar'
import BotonNuevoMovimiento from './BotonNuevoMovimiento'
import ModalNuevoMovimiento from '../pages/transacciones/ModalNuevoMovimiento'
import {
  IconoResumen, IconoMovimientos, IconoTarjetas, IconoPatrimonio, IconoPlan,
} from './iconos'
import { useDireccionScroll } from '../hooks/useDireccionScroll'
import { useEscribirTxn } from '../hooks/useEscribirTxn'
import { useMenosMovimiento } from '../lib/movimiento'

interface Props {
  children: React.ReactNode
  userId: string
}

/**
 * Cinco destinos, cada uno una pregunta (tarea 3.1). La configuración NO está
 * acá: vive detrás del engranaje del título de Resumen, porque es configuración
 * y no un lugar al que se va.
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
  const { pathname } = useLocation()

  // La barra se encoge al bajar y vuelve entera al subir (iOS 26). Se apaga con
  // movimiento reducido: ahí queda siempre entera, que es el equivalente quieto
  // correcto (apple-design §14), no un encogimiento sin transición.
  const bajando = useDireccionScroll()
  const reducido = useMenosMovimiento()
  const compacta = bajando && !reducido

  // El `+` global. La hoja se monta abajo, FUERA de la barra flotante: esa barra
  // es `pointer-events-none` y tiene `transform` (se encoge al scrollear), y un
  // `transform` la vuelve el bloque contenedor de cualquier `fixed` que cuelgue
  // de ella — la hoja quedaba encerrada en la barra y sorda al tap del cierre.
  const [nuevoAbierto, setNuevoAbierto] = useState(false)
  const { addTxn, addTransferencia } = useEscribirTxn(userId)

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
    <div className="min-h-dvh">
      {/*
        Sin header: el nombre de cada pantalla es su título grande, que es
        contenido y scrollea con ella (TituloGrande). Arriba solo queda el
        borde de scroll de iOS 26 (`.borde-barra-estado`): desenfoque teñido
        del fondo bajo la barra de estado, para que lo que pasa por debajo del
        reloj no se lea encima de él.
      */}
      <div
        aria-hidden="true"
        className="fixed top-0 inset-x-0 z-30 h-[calc(env(safe-area-inset-top,0px)+1.25rem)] pointer-events-none borde-barra-estado"
      />

      {/*
        Padding arriba = la safe area (el título trae su propio aire); abajo =
        alto de la barra flotante (cápsula/FAB ~56) + su separación del borde +
        un respiro, todo más la safe area. Un solo lugar para todas las páginas.
      */}
      <main className="pt-[env(safe-area-inset-top,0px)] pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
        {/* Alertas globales: una tarjeta de vidrio dentro del flujo, así que scrollean con
            el contenido y aparecer/desaparecer no descuadra ninguna capa fija. */}
        <AlertasBanner userId={userId} />
        <PagosPorCategorizar userId={userId} />
        {children}
      </main>

      {/*
        Barra flotante: la cápsula del nav y el FAB, misma fila, despegadas de
        los bordes. El contenedor es `pointer-events-none` para que los toques
        pasen por los huecos a los lados; cada pieza reactiva su propio
        `pointer-events-auto`.
      */}
      <div
        className={`fixed inset-x-0 z-30 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] px-3 flex items-center justify-center gap-2 pointer-events-none origin-bottom transition-transform duration-normal ease-salida ${
          compacta ? 'scale-90' : 'scale-100'
        }`}
      >
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

        <BotonNuevoMovimiento onClick={() => setNuevoAbierto(true)} />
      </div>

      {/* La hoja del `+`, a nivel de Layout (no dentro de la barra): raíz sin
          `transform` ni `pointer-events-none`, así el `fixed inset-0` es relativo
          al viewport y todo el contenido —incluido el cierre— recibe toques. */}
      {nuevoAbierto && (
        <ModalNuevoMovimiento
          agregar={addTxn}
          agregarTransferencia={addTransferencia}
          onCerrar={() => setNuevoAbierto(false)}
        />
      )}
    </div>
  )
}
