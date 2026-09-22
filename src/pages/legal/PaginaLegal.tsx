import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'

interface Props {
  titulo: string
  /** Fecha de la última revisión, en texto. */
  vigencia: string
  children: ReactNode
}

/**
 * El marco de las dos páginas legales: encabezado, botón de volver y el ancho
 * de lectura. Existe para que privacidad y términos no se separen en tipografía
 * — son el mismo documento para el lector.
 *
 * No hay `prose` de Tailwind acá (no está instalado el plugin), así que los
 * estilos de texto van en los componentes `P` y `H` de abajo, que se exportan
 * para que las dos páginas usen los mismos.
 */
export default function PaginaLegal({ titulo, vigencia, children }: Props) {
  const navigate = useNavigate()

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* -1 y no /ajustes: estas páginas también se abren desde el login,
          donde /ajustes no existe todavía. Volver es volver de donde vino. */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="presionable text-textDim text-sm mb-5 hover:text-text"
      >
        ‹ Volver
      </button>

      <h1 className="text-text font-display font-bold text-xl tracking-titulo">{titulo}</h1>
      <p className="text-textDim text-xs mt-1 mb-6 tracking-micro">Última revisión: {vigencia}</p>

      <div className="space-y-4 pb-8">{children}</div>
    </div>
  )
}

/** Un párrafo del cuerpo. */
export const P = ({ children }: { children: ReactNode }) => (
  <p className="text-textDim text-sm leading-relaxed">{children}</p>
)

/** Un título de sección. */
export const H = ({ children }: { children: ReactNode }) => (
  <h2 className="text-text text-sm font-semibold tracking-titulo pt-3">{children}</h2>
)

/** Una lista de puntos. */
export const L = ({ children }: { children: ReactNode }) => (
  <ul className="text-textDim text-sm leading-relaxed list-disc pl-5 space-y-1.5">{children}</ul>
)
