import { useState } from 'react'
import { promedioCentavos } from '../../lib/finanzas'
import { MESES } from '../../lib/constants'
import { useMoneda } from '../../hooks/useMoneda'

interface Props {
  /** Lo que devuelve useResumen6Meses: montos en CENTAVOS. */
  resumen: { mes: string; mesKey: string; ingresos: number; gastos: number }[]
}

type Serie = 'gastos' | 'ingresos'

// Clases literales por serie: el JIT de Tailwind no ve `bg-${x}`.
const BARRA: Record<Serie, string> = { gastos: 'bg-danger', ingresos: 'bg-success' }

/**
 * Seis meses como las barras de Salud: UNA serie a la vez (Gastos o Ingresos,
 * con un segmentado chico), el mes elegido encendido y el resto atenuado, la
 * cifra grande arriba y una línea punteada con el promedio.
 *
 * Antes eran dos series de Recharts lado a lado con un tooltip flotante que en
 * el teléfono tapaba las barras. Acá no hay tooltip: se toca un mes y la cifra
 * de arriba pasa a ser la suya. Es HTML y no Recharts porque son seis
 * rectángulos — el alto sale del porcentaje contra el máximo.
 */
export default function Grafica6Meses({ resumen }: Props) {
  const fmt = useMoneda()
  const [serie, setSerie] = useState<Serie>('gastos')
  // null = "el último mes". No se inicializa con `resumen.length - 1`: el
  // componente se monta antes de que lleguen los datos (resumen = []), y ese
  // -1 quedaba fijo apuntando a un mes que no existe.
  const [elegido, setElegido] = useState<number | null>(null)

  if (!resumen.some(r => r.ingresos > 0 || r.gastos > 0)) return null

  const valores = resumen.map(r => r[serie])
  const max = Math.max(...valores, 1)
  const promedio = promedioCentavos(valores)
  const ultimo = resumen.length - 1
  const i = elegido === null ? ultimo : Math.min(elegido, ultimo)
  const mesElegido = resumen[i]
  const nombreMes = MESES[Number(mesElegido.mesKey.slice(5, 7)) - 1]

  return (
    <section aria-labelledby="seis-titulo" className="vidrio-panel rounded-tarjeta p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 id="seis-titulo" className="text-textDim text-[15px] font-semibold">Últimos 6 meses</h2>
        <div role="group" aria-label="Serie" className="flex bg-vidrio-relleno rounded-full p-0.5">
          {(['gastos', 'ingresos'] as Serie[]).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSerie(s)}
              aria-pressed={serie === s}
              className={`h-7 px-3 rounded-full text-[13px] transition-colors duration-rapida ${
                serie === s ? 'bg-vidrio-segmento shadow-chip text-text font-semibold' : 'text-textDim font-medium'
              }`}
            >
              {s === 'gastos' ? 'Gastos' : 'Ingresos'}
            </button>
          ))}
        </div>
      </div>

      <p className="text-textDim text-[13px]">
        <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full mr-1.5 ${BARRA[serie]}`} />
        {serie === 'gastos' ? 'Gastos' : 'Ingresos'} de {nombreMes.toLowerCase()}
      </p>
      <p className="text-text text-[28px] leading-8 font-bold tabular-nums tracking-titulo">
        {fmt(mesElegido[serie])}
      </p>
      <p className="text-textDim text-[13px] tabular-nums mb-4">Promedio {fmt(promedio)}</p>

      <div className="relative h-36">
        {/* La línea del promedio, detrás de las barras. */}
        {promedio > 0 && (
          <div
            aria-hidden="true"
            className="absolute inset-x-0 border-t border-dashed border-textDim/40"
            style={{ bottom: `${(promedio / max) * 100}%` }}
          />
        )}
        <div className="relative h-full flex items-end justify-between gap-2">
          {resumen.map((r, k) => {
            const activa = k === i
            return (
              <button
                key={r.mesKey}
                type="button"
                onClick={() => setElegido(k)}
                aria-pressed={activa}
                aria-label={`${MESES[Number(r.mesKey.slice(5, 7)) - 1]}: ${fmt(r[serie])}`}
                className="flex-1 h-full flex items-end justify-center"
              >
                <span
                  className={`block w-full max-w-7 rounded-full transition-all duration-normal ease-salida ${BARRA[serie]} ${
                    activa ? 'opacity-100' : 'opacity-35'
                  }`}
                  // Un mes en cero muestra un punto, no nada: "hubo 0" y "no
                  // hay barra" se leerían distinto.
                  style={{ height: `max(${(r[serie] / max) * 100}%, 0.5rem)` }}
                />
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex justify-between gap-2 mt-2">
        {resumen.map((r, k) => (
          <span
            key={r.mesKey}
            aria-hidden="true"
            className={`flex-1 text-center text-[12px] ${k === i ? 'text-text font-semibold' : 'text-textDim'}`}
          >
            {r.mes}
          </span>
        ))}
      </div>
    </section>
  )
}
