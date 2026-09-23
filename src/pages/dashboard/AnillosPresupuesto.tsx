import { Link } from 'react-router-dom'
import type { AnilloPresupuesto } from '../../lib/finanzas'
import { COLOR_CATEGORIA_FALLBACK } from '../../lib/constants'
import { IconoChevron } from '../../components/iconos'

interface Props {
  anillos: AnilloPresupuesto[]
  coloresCategorias: Record<string, string>
  /** "Quedan 7 días del mes", o nada si el mes mostrado no es el actual. */
  pista?: string
}

// Radios de afuera hacia adentro, con el mismo grosor y separación: los anillos
// de Actividad. La caja es de 120 y el trazo de 11.
const RADIOS = [52, 39, 26]
const TRAZO = 11

const claseEstado = { ok: 'text-success', alerta: 'text-warning', excedido: 'text-danger' } as const

/**
 * Los presupuestos más exigidos del mes, como los anillos de Actividad: un
 * vistazo de "cuánto me queda" sin leer tres barras. El anillo se llena hasta
 * el 100 % y ahí se queda; el número de al lado dice cuánto se pasó.
 *
 * Toda la tarjeta lleva a Presupuesto, que es donde se actúa sobre esto.
 */
export default function AnillosPresupuesto({ anillos, coloresCategorias, pista }: Props) {
  const color = (cat: string) => coloresCategorias[cat] ?? COLOR_CATEGORIA_FALLBACK
  const resumen = anillos.map(a => `${a.categoria} ${a.pct}%`).join(', ')

  return (
    <Link
      to="/plan/presupuesto"
      className="presionable vidrio-panel rounded-tarjeta px-4 py-4 flex items-center gap-4"
    >
      <svg role="img" aria-label={`Presupuesto: ${resumen}`} width="112" height="112" viewBox="0 0 120 120" className="shrink-0">
        <g transform="rotate(-90 60 60)" fill="none" strokeWidth={TRAZO} strokeLinecap="round">
          {anillos.map((a, i) => {
            const r = RADIOS[i]
            const circ = 2 * Math.PI * r
            const lleno = Math.min(a.pct, 100) / 100 * circ
            return (
              <g key={a.categoria}>
                <circle cx="60" cy="60" r={r} style={{ stroke: 'var(--m-relleno)' }} />
                {/* Un 0 % con extremos redondos pintaría un punto: mejor nada. */}
                {lleno > 0 && (
                  <circle
                    cx="60" cy="60" r={r} stroke={color(a.categoria)}
                    strokeDasharray={`${lleno} ${circ}`}
                  />
                )}
              </g>
            )
          })}
        </g>
      </svg>

      <div className="flex-1 min-w-0 space-y-2">
        <div>
          <p className="text-text text-[17px] font-semibold flex items-center justify-between">
            Presupuesto
            <IconoChevron direccion="der" size={16} className="text-textDim" />
          </p>
          {pista && <p className="text-textDim text-[13px]">{pista}</p>}
        </div>
        {anillos.map(a => (
          <div key={a.categoria} className="flex items-center gap-2">
            <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color(a.categoria) }} />
            <span className="text-text text-[15px] flex-1 truncate">{a.categoria}</span>
            <span className={`text-[15px] font-semibold tabular-nums ${claseEstado[a.estado]}`}>{a.pct}%</span>
          </div>
        ))}
      </div>
    </Link>
  )
}
