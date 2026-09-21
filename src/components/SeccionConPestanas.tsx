import { NavLink, Outlet } from 'react-router-dom'

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
 */
export default function SeccionConPestanas({ pestanas }: Props) {
  return (
    <>
      {/* El contenedor es solo del riel: el `<Outlet>` queda afuera para que
          cada página conserve su propio `max-w-lg px-4` y no se dupliquen los
          16px de gutter. */}
      <div className="max-w-lg mx-auto px-4 pt-5">
        <div className="flex gap-1 bg-surface rounded-control p-1">
          {pestanas.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `presionable flex-1 min-w-0 px-2 py-2 rounded-chip text-center text-xs font-medium ${
                  isActive ? 'bg-accent text-bg font-semibold' : 'text-textDim hover:text-text'
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
