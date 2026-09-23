import { useState } from 'react'
import { calcRebanadasCategorias } from '../../lib/finanzas'
import { COLOR_CATEGORIA_FALLBACK } from '../../lib/constants'
import { useMoneda } from '../../hooks/useMoneda'

/** Rebanadas antes de agrupar la cola en "Otros". */
const MAX_REBANADAS = 5

// Geometría del anillo, en unidades del viewBox (200 × 200).
const R = 78
const TRAZO = 20
const HUECO = 5   // separación visible entre rebanadas
const CIRC = 2 * Math.PI * R

/**
 * Largos de arco para valores dados, con un piso por arco: los que quedan bajo
 * el piso reciben el piso y el resto del círculo se reparte en proporción
 * entre los demás, repitiendo hasta que ninguno quede debajo.
 */
function arcosVisibles(valores: number[], circ: number, piso: number): number[] {
  const fijos = new Set<number>()
  for (;;) {
    const libres = valores.map((v, i) => (fijos.has(i) ? 0 : v)).reduce((s, v) => s + v, 0)
    const resto = circ - fijos.size * piso
    const arcos = valores.map((v, i) => (fijos.has(i) ? piso : (v / libres) * resto))
    const nuevos = arcos.map((a, i) => (!fijos.has(i) && a < piso ? i : -1)).filter(i => i >= 0)
    if (nuevos.length === 0 || fijos.size + nuevos.length >= valores.length) return arcos
    nuevos.forEach(i => fijos.add(i))
  }
}

interface Props {
  /** Centavos por categoría, tal como los devuelve calcEstadisticasMes. */
  porCategoria: Record<string, number>
  coloresCategorias: Record<string, string>
}

/**
 * Gastos por categoría como el anillo de Tiempo en pantalla: segmentos gruesos
 * con puntas redondas y separados, el total al centro y la lista debajo.
 *
 * Es SVG propio y no un `Pie` de Recharts: con extremos redondos y huecos
 * constantes el anillo habla el mismo idioma que los anillos de presupuesto, y
 * el tooltip flotante (que en el teléfono tapaba el gráfico) se reemplaza por
 * tocar una fila: el centro pasa a mostrar esa categoría y el resto se apaga.
 */
export default function GraficaCategorias({ porCategoria, coloresCategorias }: Props) {
  const fmt = useMoneda()
  const [elegida, setElegida] = useState<string | null>(null)

  const { rebanadas, total } = calcRebanadasCategorias(porCategoria, MAX_REBANADAS)
  if (rebanadas.length === 0) return null

  const color = (cat: string) => coloresCategorias[cat] ?? COLOR_CATEGORIA_FALLBACK
  const actual = rebanadas.find(r => r.cat === elegida) ?? null

  // Cada segmento ocupa su parte del círculo menos el hueco. Con puntas
  // redondas el trazo se estira TRAZO/2 de cada lado, así que el guion se
  // acorta eso. Una categoría chica (1 %) no alcanza ni para el punto de la
  // punta redonda y se encimaba con la vecina, así que cada rebanada tiene un
  // arco MÍNIMO visible y el resto del círculo se reparte en proporción. Es
  // solo geometría: los montos y porcentajes que se leen son los reales.
  const unica = rebanadas.length === 1
  const arcos = arcosVisibles(rebanadas.map(r => r.valor), CIRC, TRAZO + HUECO + 6)
  const segmentos = rebanadas.map((r, k) => {
    const inicio = arcos.slice(0, k).reduce((s, x) => s + x, 0)
    const guion = unica ? CIRC : Math.max(arcos[k] - HUECO - TRAZO, 0.01)
    return { ...r, guion, desfase: unica ? 0 : -(inicio + (HUECO + TRAZO) / 2) }
  })

  return (
    <section aria-labelledby="cat-titulo" className="vidrio-panel rounded-tarjeta p-4">
      <h2 id="cat-titulo" className="text-textDim text-[15px] font-semibold mb-2">Gastos por categoría</h2>

      <div className="relative mx-auto w-52 h-52">
        <svg
          role="img"
          aria-label={rebanadas.map(r => `${r.cat} ${r.pct}%`).join(', ')}
          viewBox="0 0 200 200"
          className="w-full h-full"
        >
          <g transform="rotate(-90 100 100)" fill="none" strokeWidth={TRAZO} strokeLinecap={unica ? 'butt' : 'round'}>
            {segmentos.map(s => (
              <circle
                key={s.cat}
                cx="100" cy="100" r={R}
                stroke={color(s.cat)}
                strokeDasharray={`${s.guion} ${CIRC}`}
                strokeDashoffset={s.desfase}
                className="transition-opacity duration-rapida ease-salida"
                opacity={actual && actual.cat !== s.cat ? 0.25 : 1}
              />
            ))}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-9 pointer-events-none">
          <p className="text-textDim text-[13px] truncate max-w-full">{actual ? actual.cat : 'Total'}</p>
          <p className="text-text text-[18px] font-bold tabular-nums tracking-titulo">
            {fmt(actual ? actual.valor : total)}
          </p>
          {actual && <p className="text-textDim text-[13px] tabular-nums">{actual.pct}%</p>}
        </div>
      </div>

      <ul className="mt-3 -mx-2">
        {rebanadas.map(r => {
          const activa = elegida === r.cat
          return (
            <li key={r.cat}>
              <button
                type="button"
                onClick={() => setElegida(activa ? null : r.cat)}
                aria-pressed={activa}
                className={`w-full flex items-center gap-3 h-11 px-2 rounded-control transition-colors duration-rapida ${
                  activa ? 'bg-vidrio-relleno' : ''
                }`}
              >
                <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color(r.cat) }} />
                <span className="flex-1 min-w-0 text-left text-text text-[15px] truncate">{r.cat}</span>
                <span className="text-text text-[15px] font-semibold tabular-nums">{fmt(r.valor)}</span>
                <span className="w-10 text-right text-textDim text-[13px] tabular-nums">{r.pct}%</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
