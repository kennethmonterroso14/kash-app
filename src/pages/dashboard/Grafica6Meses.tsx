import { useState } from 'react'
import { promedioCentavos } from '../../lib/finanzas'
import { MESES } from '../../lib/constants'
import { useMoneda } from '../../hooks/useMoneda'

interface Props {
  /** Lo que devuelve useResumen6Meses: montos en CENTAVOS. */
  resumen: { mes: string; mesKey: string; ingresos: number; gastos: number }[]
}

/**
 * Seis meses como las barras de Salud: ingresos y gastos juntos, en barras
 * pareadas por mes, y arriba el neto del mes elegido con sus dos componentes.
 * Responde de un vistazo "¿cerré el mes arriba o abajo?".
 *
 * Hubo vistas separadas de Gastos e Ingresos (una serie a la vez); se quitaron
 * porque las barras pareadas ya muestran las dos series, y el segmentado era
 * un control más para ver lo mismo.
 *
 * No hay tooltip: se toca un mes y la cifra de arriba pasa a ser la suya, el
 * mes elegido va encendido y el resto atenuado. Es HTML y no Recharts porque
 * son doce rectángulos — el alto sale del porcentaje contra el máximo.
 */
export default function Grafica6Meses({ resumen }: Props) {
  const fmt = useMoneda()
  // null = "el último mes". No se inicializa con `resumen.length - 1`: el
  // componente se monta antes de que lleguen los datos (resumen = []), y ese
  // -1 quedaba fijo apuntando a un mes que no existe.
  const [elegido, setElegido] = useState<number | null>(null)

  if (!resumen.some(r => r.ingresos > 0 || r.gastos > 0)) return null

  const max = Math.max(...resumen.flatMap(r => [r.ingresos, r.gastos]), 1)
  const ultimo = resumen.length - 1
  const i = elegido === null ? ultimo : Math.min(elegido, ultimo)
  const mesElegido = resumen[i]
  const nombreMes = MESES[Number(mesElegido.mesKey.slice(5, 7)) - 1]
  const neto = mesElegido.ingresos - mesElegido.gastos
  const netoPromedio = promedioCentavos(resumen.map(r => r.ingresos - r.gastos))
  const signo = (n: number) => (n > 0 ? '+' : '')
  // Un mes en cero muestra un punto, no nada: "hubo 0" y "no hay barra" se
  // leerían distinto.
  const alto = (v: number) => `max(${(v / max) * 100}%, 0.5rem)`

  return (
    <section aria-labelledby="seis-titulo" className="vidrio-panel rounded-tarjeta p-4">
      <h2 id="seis-titulo" className="text-textDim text-[15px] font-semibold mb-2.5">Últimos 6 meses</h2>

      <p className="text-textDim text-[13px]">Neto de {nombreMes.toLowerCase()}</p>
      <p className={`text-[28px] leading-8 font-bold tabular-nums tracking-titulo ${neto >= 0 ? 'text-success' : 'text-danger'}`}>
        {signo(neto)}{fmt(neto)}
      </p>
      <p className="text-textDim text-[13px] tabular-nums flex flex-wrap gap-x-3">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="w-2 h-2 rounded-full bg-success" />Ingresos {fmt(mesElegido.ingresos)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="w-2 h-2 rounded-full bg-danger" />Gastos {fmt(mesElegido.gastos)}
        </span>
      </p>
      <p className="text-textDim text-[13px] tabular-nums mb-4">Neto promedio {signo(netoPromedio)}{fmt(netoPromedio)}</p>

      <div className="h-36 flex items-end justify-between gap-2">
        {resumen.map((r, k) => {
          const activa = k === i
          return (
            <button
              key={r.mesKey}
              type="button"
              onClick={() => setElegido(k)}
              aria-pressed={activa}
              aria-label={`${MESES[Number(r.mesKey.slice(5, 7)) - 1]}: ingresos ${fmt(r.ingresos)}, gastos ${fmt(r.gastos)}`}
              className={`flex-1 h-full flex items-end justify-center gap-1 transition-opacity duration-normal ease-salida ${
                activa ? 'opacity-100' : 'opacity-35'
              }`}
            >
              <span className="block w-full max-w-3.5 rounded-full bg-success transition-all duration-normal ease-salida" style={{ height: alto(r.ingresos) }} />
              <span className="block w-full max-w-3.5 rounded-full bg-danger transition-all duration-normal ease-salida" style={{ height: alto(r.gastos) }} />
            </button>
          )
        })}
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
