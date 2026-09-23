import { motion } from 'motion/react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AL_INSTANTE, posicionIndicador, RESORTE_SEGMENTO, useMenosMovimiento } from '../lib/movimiento'

export interface Pestana {
  to: string
  label: string
}

interface Props {
  pestanas: Pestana[]
}

/**
 * Un riel segmentado más el contenido de la pestaña activa.
 *
 * La pestaña vive en la URL (`/patrimonio/cuentas`) y no en un `useState`: así
 * el botón de atrás funciona, el enlace se puede compartir y un refresh no
 * pierde dónde estabas.
 *
 * Va en el CONTENIDO y no sticky, sin vidrio propio: un riel pegado debajo del
 * header — que ya es `vidrio-chrome` — sería apilar un segundo material pesado,
 * que es justo lo que apple-design §12 dice que no se hace. Las apps de Apple
 * ponen sus controles segmentados en el contenido por lo mismo.
 *
 * Son enlaces de navegación, así que NO llevan `role="tab"`: mentir el rol le
 * rompe al lector de pantalla la semántica que ya entiende. El
 * `aria-current="page"` de la activa lo pone `NavLink` solo.
 *
 * ## El movimiento
 *
 * El indicador se desliza entre pestañas en vez de saltar: es consistencia
 * espacial (§7) — dice de dónde vino la selección, que en un riel de tres es
 * la diferencia entre "cambió algo" y "me moví a la de al lado".
 *
 * La posición la calcula `posicionIndicador` en vez de medirla con el
 * `layoutId` de Motion: las pestañas son `flex-1`, todas del mismo ancho, y el
 * `layoutId` habría costado +37 KB gzip de motor de proyección.
 */
export default function SeccionConPestanas({ pestanas }: Props) {
  const reducido = useMenosMovimiento()
  const { pathname } = useLocation()
  const activa = pestanas.findIndex(
    p => pathname === p.to || pathname.startsWith(`${p.to}/`),
  )

  return (
    <>
      {/* El contenedor es solo del riel: el `<Outlet>` queda afuera para que
          cada página conserve su propio `max-w-lg px-4` y no se dupliquen los
          16px de gutter. */}
      <div className="max-w-lg mx-auto px-4 pt-5">
        <div className="relative flex gap-1 vidrio-panel rounded-control p-1">
          {/* Una sola píldora que se mueve, no una por pestaña: es la que se
              desliza, y las pestañas solo cambian de color de texto. */}
          {activa >= 0 && (
            <motion.span
              aria-hidden="true"
              className="absolute top-1 bottom-1 left-1 bg-accent rounded-chip"
              style={{ width: posicionIndicador(activa, pestanas.length).width }}
              animate={{ transform: posicionIndicador(activa, pestanas.length).transform }}
              transition={reducido ? AL_INSTANTE : RESORTE_SEGMENTO}
            />
          )}
          {pestanas.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `presionable relative flex-1 min-w-0 px-2 py-2 rounded-chip text-center text-xs font-medium ${
                  isActive ? 'text-bg font-semibold' : 'text-textDim hover:text-text'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      </div>

      <Outlet />
    </>
  )
}
