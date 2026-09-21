import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { DUR, SALIDA, useMenosMovimiento } from '../lib/movimiento'

interface Props {
  /** `error` para algo que falló, `atencion` para algo que conviene saber. */
  tono?: 'error' | 'atencion'
  /** Si se pasa, el aviso lleva una ✕ que lo descarta. */
  onCerrar?: () => void
  /** Solo separación respecto a los hermanos (`mb-4`), nunca el aspecto del aviso. */
  clase?: string
  children: ReactNode
}

const TONOS = {
  error: 'text-danger bg-danger/10',
  atencion: 'text-warning bg-warning/10',
}

/**
 * Un aviso de error o de atención, con `role="alert"` para que se anuncie.
 *
 * El `role` es la razón de ser del primitivo: de los treinta y un avisos que
 * había, **doce no lo tenían**, así que un lector de pantalla no decía nada
 * cuando una escritura fallaba — y el aviso es lo único que el usuario tiene
 * para enterarse, porque un `console.error` no lo lee nadie. Ahora no se puede
 * escribir uno sin él.
 *
 * Una sola forma, también: `text-sm` con fondo, `rounded-control` y `px-4 py-3`.
 * Los avisos dentro de las hojas eran una línea roja suelta en `text-xs` y sin
 * fondo, que a ese tamaño y ese contraste se leía como una nota al pie en lugar
 * de como el motivo por el que el formulario no guardó.
 *
 * ## El movimiento
 *
 * Entra con un fundido y 4px de asentamiento. Es indicación de estado: el aviso
 * es lo único que dice que la escritura falló, y aparecer de golpe en medio de
 * un formulario se confunde con algo que ya estaba ahí.
 *
 * **No anima su salida.** Eso necesitaría que el aviso decidiera cuándo lo
 * desmonta el padre, como hace `Hoja`, y no vale la cirugía: el aviso se va
 * cuando el usuario reintenta, o sea mirando otra cosa.
 *
 * Tampoco intenta evitar el salto del contenido de abajo: eso sería animar el
 * `height`, que no es una propiedad que se pueda animar barato.
 */
export default function Aviso({ tono = 'error', onCerrar, clase, children }: Props) {
  const reducido = useMenosMovimiento()
  return (
    <motion.div
      role="alert"
      initial={reducido ? { opacity: 0 } : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.rapida, ease: SALIDA }}
      className={`text-sm rounded-control px-4 py-3 ${TONOS[tono]}${
        onCerrar ? ' flex justify-between items-start gap-3' : ''
      }${clase ? ` ${clase}` : ''}`}
    >
      {onCerrar ? <span>{children}</span> : children}
      {onCerrar && (
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar aviso"
          className={`presionable leading-none shrink-0 ${
            tono === 'error' ? 'text-danger/70 hover:text-danger' : 'text-warning/70 hover:text-warning'
          }`}
        >
          ×
        </button>
      )}
    </motion.div>
  )
}
