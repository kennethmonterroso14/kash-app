import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Lo que dura armado antes de rendirse solo. */
const MS_ARMADO = 3000

interface Props {
  /** Qué se va a hacer, en infinitivo y con el objeto: `Eliminar Netflix`. */
  accion: string
  /** Lo que anuncia armado. Por defecto `Confirmar: <accion>`. */
  confirmacion?: string
  /** Lo que se ve en reposo. `×` en las filas, el texto completo en las hojas. */
  etiqueta: ReactNode
  /** Lo que se ve armado. */
  etiquetaArmada?: ReactNode
  /** `chip` para las filas de una lista, `bloque` para un botón de hoja. */
  variante?: 'chip' | 'bloque'
  disabled?: boolean
  onConfirmar: () => void
}

const CLASES: Record<NonNullable<Props['variante']>, { base: string; reposo: string; armado: string }> = {
  chip: {
    base: 'text-xs px-2 py-1 rounded-chip flex-shrink-0',
    reposo: 'text-textDim hover:text-danger',
    armado: 'bg-danger text-text',
  },
  bloque: {
    base: 'w-full py-2 rounded-control text-xs',
    reposo: 'text-danger/70 hover:text-danger',
    armado: 'bg-danger/10 text-danger font-semibold',
  },
}

/**
 * Acción destructiva en dos toques: el primero arma el botón, el segundo la
 * ejecuta, y si el segundo no llega en 3s el botón se rinde solo. Es la
 * alternativa a `window.confirm`, que en un WebView es un diálogo del sistema
 * que no se puede estilar y que bloquea el hilo.
 *
 * **El timeout vive acá**, y con `clearTimeout` al desmontar. En los nueve
 * sitios que esto reemplaza el `setTimeout` quedaba colgando: en React 18 un
 * `setState` sobre un componente desmontado es un no-op silencioso, así que no
 * rompía nada, pero el temporizador sobrevivía al componente y cualquier
 * callback que hiciera algo más que `setState` sí habría hecho daño.
 *
 * **Cambio de comportamiento:** el estado deja de estar en la página, que
 * guardaba *un* id armado y por eso armar una fila desarmaba la anterior. Ahora
 * cada botón tiene el suyo, así que dos filas pueden estar armadas a la vez.
 * Cada una sigue necesitando su propio segundo toque y se rinde sola a los 3s;
 * es el precio de que el primitivo sea dueño del temporizador, y a cambio
 * ninguna página vuelve a escribir esta máquina de dos estados.
 *
 * El `aria-label` armado nombra la fila (`Confirmar: Eliminar Netflix`). Antes
 * decía `Confirmar eliminación` en las cinco listas, sin decir de qué.
 */
export default function BotonConfirmar({
  accion, confirmacion, etiqueta, etiquetaArmada = 'Confirmar',
  variante = 'chip', disabled, onConfirmar,
}: Props) {
  const [armado, setArmado] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const alTocar = () => {
    if (!armado) {
      setArmado(true)
      timer.current = setTimeout(() => setArmado(false), MS_ARMADO)
      return
    }
    if (timer.current) clearTimeout(timer.current)
    setArmado(false)
    onConfirmar()
  }

  const c = CLASES[variante]
  return (
    <button
      type="button"
      onClick={alTocar}
      disabled={disabled}
      aria-label={armado ? confirmacion ?? `Confirmar: ${accion}` : accion}
      className={`presionable ${c.base} ${armado ? c.armado : c.reposo} disabled:opacity-50`}
    >
      {armado ? etiquetaArmada : etiqueta}
    </button>
  )
}
