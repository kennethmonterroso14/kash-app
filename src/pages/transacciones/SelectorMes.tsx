import { MESES } from '../../lib/constants'

interface Props {
  /** 'YYYY-MM' */
  mes: string
  onCambiar: (mes: string) => void
}

/** Navegación mes a mes. El mes viaja como 'YYYY-MM'; el hook deriva la ventana. */
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
    <div className="flex items-center gap-2 min-w-0">
      <button onClick={() => mover(-1)} aria-label="Mes anterior" className="presionable text-textDim hover:text-text p-1">←</button>
      {/* nowrap: "Septiembre 2026" se partía en dos renglones a 390px y
          descuadraba toda la fila del header. */}
      <span className="text-text font-medium tracking-titulo whitespace-nowrap">
        {MESES[mesNum - 1]} {anio}
      </span>
      <button onClick={() => mover(1)} aria-label="Mes siguiente" className="presionable text-textDim hover:text-text p-1">→</button>
    </div>
  )
}
