import { useState } from 'react'
import { promedioCentavos } from '../../lib/finanzas'
import { MESES } from '../../lib/constants'
import { useMoneda } from '../../hooks/useMoneda'

interface Props {
  /** Lo que devuelve useResumen6Meses: montos en CENTAVOS. */
  resumen: { mes: string; mesKey: string; ingresos: number; gastos: number }[]
}

type Serie = 'gastos' | 'ingresos'
/** Neto: ingresos y gastos juntos, en barras pareadas, con el neto del mes arriba. */
type Vista = 'neto' | Serie

const VISTAS: { v: Vista; etiqueta: string }[] = [
  { v: 'neto', etiqueta: 'Neto' },
  { v: 'gastos', etiqueta: 'Gastos' },
  { v: 'ingresos', etiqueta: 'Ingresos' },
]

// Clases literales por serie: el JIT de Tailwind no ve `bg-${x}`.
const BARRA: Record<Serie, string> = { gastos: 'bg-danger', ingresos: 'bg-success' }

/**
 * Seis meses como las barras de Salud, con un segmentado chico de tres vistas:
 *
 * - **Neto** (la de entrada): ingresos y gastos juntos en barras pareadas, y
 *   arriba el neto del mes elegido con sus dos componentes. Responde "¿cerré
 *   el mes arriba o abajo?", que es la pregunta de un vistazo.
 * - **Gastos** / **Ingresos**: una serie sola, con una línea punteada en el
 *   promedio de los seis meses.
 *
 * En todas, el mes elegido va encendido y el resto atenuado.
 *
 * Antes eran dos series de Recharts lado a lado con un tooltip flotante que en
 * el teléfono tapaba las barras. Acá no hay tooltip: se toca un mes y la cifra
 * de arriba pasa a ser la suya. Es HTML y no Recharts porque son seis
 * rectángulos — el alto sale del porcentaje contra el máximo.
 */
export default function Grafica6Meses({ resumen }: Props) {
  const fmt = useMoneda()
  const [vista, setVista] = useState<Vista>('neto')
  // null = "el último mes". No se inicializa con `resumen.length - 1`: el
  // componente se monta antes de que lleguen los datos (resumen = []), y ese
  // -1 quedaba fijo apuntando a un mes que no existe.
  const [elegido, setElegido] = useState<number | null>(null)

  if (!resumen.some(r => r.ingresos > 0 || r.gastos > 0)) return null

  const esNeto = vista === 'neto'
  const serie: Serie = esNeto ? 'gastos' : vista   // solo se lee fuera de Neto
  const valores = esNeto
    ? resumen.flatMap(r => [r.ingresos, r.gastos])
    : resumen.map(r => r[serie])
  const max = Math.max(...valores, 1)
  const promedio = esNeto ? 0 : promedioCentavos(valores)
  const ultimo = resumen.length - 1
  const i = elegido === null ? ultimo : Math.min(elegido, ultimo)
  const mesElegido = resumen[i]
  const nombreMes = MESES[Number(mesElegido.mesKey.slice(5, 7)) - 1]
  const neto = mesElegido.ingresos - mesElegido.gastos
  const alto = (v: number) => `max(${(v / max) * 100}%, 0.5rem)`

  return (
    <section aria-labelledby="seis-titulo" className="vidrio-panel rounded-tarjeta p-4">
      <h2 id="seis-titulo" className="text-textDim text-[15px] font-semibold mb-2.5">Últimos 6 meses</h2>
      {/* El segmentado en su propia fila y a lo ancho, como el D/S/M/A de
          Salud: al lado del título, con tres opciones, lo partía en dos renglones. */}
      <div className="mb-4">
        <div role="group" aria-label="Vista" className="flex bg-vidrio-relleno rounded-full p-0.5">
          {VISTAS.map(({ v, etiqueta }) => (
            <button
              key={v}
              type="button"
              onClick={() => setVista(v)}
              aria-pressed={vista === v}
              className={`flex-1 h-8 rounded-full text-[13px] transition-colors duration-rapida ${
                vista === v ? 'bg-vidrio-segmento shadow-chip text-text font-semibold' : 'text-textDim font-medium'
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      {esNeto ? (
        <>
          <p className="text-textDim text-[13px]">Neto de {nombreMes.toLowerCase()}</p>
          <p className={`text-[28px] leading-8 font-bold tabular-nums tracking-titulo ${neto >= 0 ? 'text-success' : 'text-danger'}`}>
            {neto > 0 ? '+' : ''}{fmt(neto)}
          </p>
          <p className="text-textDim text-[13px] tabular-nums mb-4 flex flex-wrap gap-x-3">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="w-2 h-2 rounded-full bg-success" />Ingresos {fmt(mesElegido.ingresos)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="w-2 h-2 rounded-full bg-danger" />Gastos {fmt(mesElegido.gastos)}
            </span>
          </p>
        </>
      ) : (
        <>
          <p className="text-textDim text-[13px]">
            <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full mr-1.5 ${BARRA[serie]}`} />
            {serie === 'gastos' ? 'Gastos' : 'Ingresos'} de {nombreMes.toLowerCase()}
          </p>
          <p className="text-text text-[28px] leading-8 font-bold tabular-nums tracking-titulo">
            {fmt(mesElegido[serie])}
          </p>
          <p className="text-textDim text-[13px] tabular-nums mb-4">Promedio {fmt(promedio)}</p>
        </>
      )}

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
                aria-label={`${MESES[Number(r.mesKey.slice(5, 7)) - 1]}: ${
                  esNeto
                    ? `ingresos ${fmt(r.ingresos)}, gastos ${fmt(r.gastos)}`
                    : fmt(r[serie])
                }`}
                className={`flex-1 h-full flex items-end justify-center gap-1 transition-opacity duration-normal ease-salida ${
                  activa ? 'opacity-100' : 'opacity-35'
                }`}
              >
                {/* Un mes en cero muestra un punto, no nada: "hubo 0" y "no
                    hay barra" se leerían distinto. */}
                {esNeto ? (
                  <>
                    <span className="block w-full max-w-3.5 rounded-full bg-success transition-all duration-normal ease-salida" style={{ height: alto(r.ingresos) }} />
                    <span className="block w-full max-w-3.5 rounded-full bg-danger transition-all duration-normal ease-salida" style={{ height: alto(r.gastos) }} />
                  </>
                ) : (
                  <span
                    className={`block w-full max-w-7 rounded-full transition-all duration-normal ease-salida ${BARRA[serie]}`}
                    style={{ height: alto(r[serie]) }}
                  />
                )}
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
