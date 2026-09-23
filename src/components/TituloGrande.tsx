import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { IconoChevron } from './iconos'

interface Props {
  titulo: string
  /** Línea chica ENCIMA del título, como la fecha en Salud o Fitness. */
  sobretitulo?: string
  /** Línea chica debajo del título: un total, una aclaración. */
  subtitulo?: ReactNode
  /** Lo que va a la derecha, alineado con la base del título: un botón. */
  accion?: ReactNode
  /** Pantallas de segundo nivel: el enlace de vuelta, arriba, como en iOS. */
  volver?: { a: string; etiqueta: string }
}

/**
 * El título grande de cada pantalla (34 pt, el `largeTitle` de iOS). Reemplaza
 * al header fijo: en las apps de Apple el nombre de la pantalla es contenido y
 * scrollea con ella, y el cromo se queda solo con la barra de abajo.
 *
 * Es el único `<h1>` de la pantalla, así que las páginas no llevan otro.
 */
export default function TituloGrande({ titulo, sobretitulo, subtitulo, accion, volver }: Props) {
  return (
    <header className="pt-6 pb-1">
      {volver && (
        <Link
          to={volver.a}
          aria-label={`Volver a ${volver.etiqueta}`}
          className="presionable inline-flex items-center gap-0.5 -ml-1.5 mb-1 h-8 pr-2 text-accent text-[17px]"
        >
          <IconoChevron direccion="izq" size={22} />
          {volver.etiqueta}
        </Link>
      )}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {sobretitulo && <p className="text-textDim text-[15px] font-medium">{sobretitulo}</p>}
          <h1 className="text-text font-display font-bold text-[34px] leading-[41px] tracking-display truncate">
            {titulo}
          </h1>
          {subtitulo && <div className="text-textDim text-sm mt-0.5">{subtitulo}</div>}
        </div>
        {accion && <div className="flex items-center gap-2 flex-shrink-0 mb-1">{accion}</div>}
      </div>
    </header>
  )
}
