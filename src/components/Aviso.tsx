import type { ReactNode } from 'react'

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
 */
export default function Aviso({ tono = 'error', onCerrar, clase, children }: Props) {
  return (
    <div
      role="alert"
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
    </div>
  )
}
