interface Props {
  activo: boolean
  onCambiar: (activo: boolean) => void
  /** Nombre accesible: lo que se activa ("Permitir editar y borrar"). */
  etiqueta: string
  disabled?: boolean
}

/**
 * El interruptor de iOS (51 × 31): pista que se llena con el acento y una
 * perilla blanca que se desliza. Es un `role="switch"`, así que un lector de
 * pantalla dice "activado/desactivado" y no "presionado".
 */
export default function Interruptor({ activo, onCambiar, etiqueta, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={() => onCambiar(!activo)}
      className={`relative shrink-0 w-[51px] h-[31px] rounded-full transition-colors duration-rapida ease-estandar disabled:opacity-40 ${
        activo ? 'bg-accent' : 'bg-vidrio-relleno'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-chip transition-transform duration-rapida ease-estandar ${
          activo ? 'translate-x-[20px]' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
