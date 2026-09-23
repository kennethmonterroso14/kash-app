import { useId } from 'react'

interface Props {
  /** Los valores en orden; solo importa la forma, así que no llevan unidad. */
  valores: number[]
  /** Alto en px; el ancho sigue al contenedor. */
  alto?: number
  etiqueta: string
}

const ANCHO = 300   // ancho del viewBox; el SVG se estira con `preserveAspectRatio`

/**
 * Una línea de evolución como las de Bolsa: trazo del acento sobre un área que
 * se desvanece, sin ejes ni tooltip, con un punto en el último valor.
 *
 * SVG propio y no Recharts: son veinte puntos y un degradado, y así los
 * colores salen de las variables del tema (`--c-accent`) en lugar de un color
 * fijo pasado por prop — cambia sola entre claro y oscuro.
 */
export default function LineaEvolucion({ valores, alto = 72, etiqueta }: Props) {
  const id = useId()
  if (valores.length < 2) return null

  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const rango = max - min || 1
  const margen = 6   // que el trazo y el punto no se corten en los bordes
  const x = (i: number) => (i / (valores.length - 1)) * ANCHO
  const y = (v: number) => margen + (1 - (v - min) / rango) * (alto - margen * 2)

  // Curva suave (Catmull-Rom pasada a Bézier), como las líneas de Bolsa: con
  // segmentos rectos cada punto del historial se leía como un quiebre.
  const pts = valores.map((v, i) => [x(i), y(v)] as const)
  const linea = pts.map(([px, py], i) => {
    if (i === 0) return `M${px.toFixed(1)} ${py.toFixed(1)}`
    const [x0, y0] = pts[Math.max(i - 2, 0)]
    const [x1, y1] = pts[i - 1]
    const [x3, y3] = pts[Math.min(i + 1, pts.length - 1)]
    const c1 = [x1 + (px - x0) / 6, y1 + (py - y0) / 6]
    const c2 = [px - (x3 - x1) / 6, py - (y3 - y1) / 6]
    return `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)}`
  }).join(' ')
  const area = `${linea} L${ANCHO} ${alto} L0 ${alto} Z`
  const yFinal = y(valores[valores.length - 1])

  return (
    <div className="relative" style={{ height: alto }}>
      <svg role="img" aria-label={etiqueta} viewBox={`0 0 ${ANCHO} ${alto}`} preserveAspectRatio="none" className="w-full h-full block">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'rgb(var(--c-accent))', stopOpacity: 0.35 }} />
            <stop offset="1" style={{ stopColor: 'rgb(var(--c-accent))', stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${CSS.escape(id)})`} />
        <path
          d={linea} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          vectorEffect="non-scaling-stroke" style={{ stroke: 'rgb(var(--c-accent))' }}
        />
      </svg>
      {/* El punto de "hoy", con su halo. Va en HTML encima del SVG: dentro del
          SVG la escala horizontal del viewBox lo estiraría en un óvalo. */}
      <span
        aria-hidden="true"
        className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full bg-accent ring-4 ring-accent/25"
        style={{ left: '100%', top: `${(yFinal / alto) * 100}%` }}
      />
    </div>
  )
}
