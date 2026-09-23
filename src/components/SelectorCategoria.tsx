import { useId } from 'react'
import AvatarCategoria from './AvatarCategoria'

interface Props {
  categorias: string[]
  colores: Record<string, string>
  valor: string
  onCambiar: (c: string) => void
}

/**
 * Las categorías como círculos, en un carril de dos filas que se desliza de
 * costado: se elige de un toque viendo todas, en lugar de abrir un `<select>`
 * con una lista de quince nombres.
 *
 * Son radios de verdad (ocultos a la vista, no al lector de pantalla): el grupo
 * se anuncia como "Categoría, 1 de 15", las flechas se mueven entre opciones y
 * el foco se ve en el círculo.
 */
export default function SelectorCategoria({ categorias, colores, valor, onCambiar }: Props) {
  const nombre = useId()

  return (
    // min-w-0: un <fieldset> tiene `min-width: min-content` por defecto, así que
    // crecía al ancho del carril ENTERO y ensanchaba la hoja: al deslizar las
    // categorías se desplazaba toda la app en lugar del carril.
    <fieldset className="min-w-0">
      <legend className="text-textDim text-xs mb-2 tracking-micro">Categoría</legend>
      <div className="grid grid-rows-2 grid-flow-col auto-cols-[4.5rem] gap-x-1 gap-y-3 overflow-x-auto overscroll-x-contain -mx-6 px-6 pt-1 pb-1 [scrollbar-width:none]">
        {categorias.map(c => {
          const activa = c === valor
          return (
            <label key={c} className="presionable flex flex-col items-center gap-1.5 cursor-pointer">
              <input
                type="radio" name={nombre} value={c} checked={activa}
                onChange={() => onCambiar(c)}
                className="peer sr-only"
              />
              <span
                className={`rounded-full p-0.5 ring-2 transition-shadow duration-rapida peer-focus-visible:ring-accent ${
                  activa ? 'ring-accent' : 'ring-transparent'
                }`}
              >
                <AvatarCategoria categoria={c} color={colores[c]} size={46} />
              </span>
              <span className={`text-[11px] leading-tight text-center line-clamp-2 w-full [overflow-wrap:anywhere] ${activa ? 'text-text font-semibold' : 'text-textDim'}`}>
                {c}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
