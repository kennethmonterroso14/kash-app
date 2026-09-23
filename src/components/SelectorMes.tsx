import { MESES } from '../lib/constants'
import { IconoChevron } from './iconos'

interface Props {
  /** 'YYYY-MM' */
  mes: string
  onCambiar: (mes: string) => void
}

/**
 * Navegación mes a mes. El mes viaja como 'YYYY-MM' y el hook deriva la ventana.
 * Vive en components/ y no junto a una página porque lo usan Movimientos y
 * Presupuesto, que antes tenían cada una su propia copia de esta aritmética.
 */
export default function SelectorMes({ mes, onCambiar }: Props) {
  const [anio, mesNum] = mes.split('-').map(Number)

  // Se construye con `new Date(anio, mesNum - 1 + delta, 1)`, que normaliza el
  // cruce de año solo: el día 1 nunca desborda, a diferencia de sumar meses
  // sobre el día de hoy.
  const mover = (delta: number) => {
    const d = new Date(anio, mesNum - 1 + delta, 1)
    onCambiar(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    // Una cápsula de vidrio, como los selectores de período de Salud y Bolsa.
    <div className="inline-flex items-center gap-1 shrink-0 vidrio-chip rounded-full h-10 px-1">
      <button onClick={() => mover(-1)} aria-label="Mes anterior" className="presionable grid place-items-center w-8 h-8 rounded-full text-textDim hover:text-text">
        <IconoChevron direccion="izq" size={18} />
      </button>
      {/* nowrap: "Septiembre 2026" se partía en dos renglones a 390px y
          descuadraba toda la fila del header. */}
      <span className="text-text text-[15px] font-semibold whitespace-nowrap px-1">
        {MESES[mesNum - 1]} {anio}
      </span>
      <button onClick={() => mover(1)} aria-label="Mes siguiente" className="presionable grid place-items-center w-8 h-8 rounded-full text-textDim hover:text-text">
        <IconoChevron direccion="der" size={18} />
      </button>
    </div>
  )
}
