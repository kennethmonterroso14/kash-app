interface Props {
  /** Lado de la caja, en px. El nav usa 22; el default cubre el resto. */
  size?: number
  className?: string
}

/**
 * Iconos dibujados, no glifos. Ninguna fuente de UI trae ◈ ≡ ▭ ◎ ◧ (los cinco del nav),
 * así que un glifo dejaba esos símbolos a merced de la fuente de último recurso
 * del navegador — otro tamaño, otro peso, y distinto en cada plataforma. Un
 * trazo propio es cromo: hereda `currentColor`, así que el destino activo se
 * pinta con `text-accent` sin tocar el icono, y mide igual en iOS, Android y web.
 *
 * Mismo lenguaje en todos (el engranaje de Ajustes incluido): trazo 1.7, sin
 * relleno, puntas y uniones redondeadas, caja de 24. Van `aria-hidden` porque
 * el `<Link>` que los envuelve ya lleva la etiqueta textual.
 */
function Base({ size = 24, className = '', children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className}
    >
      {children}
    </svg>
  )
}

/** Resumen: la cuadrícula del panel, todo de un vistazo. */
export function IconoResumen(p: Props) {
  return (
    <Base {...p}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
    </Base>
  )
}

/** Movimientos: dinero que entra y sale, dos flechas opuestas. */
export function IconoMovimientos(p: Props) {
  return (
    <Base {...p}>
      <path d="M7 20V5" />
      <path d="M3.5 8.5 7 5l3.5 3.5" />
      <path d="M17 4v15" />
      <path d="M13.5 15.5 17 19l3.5-3.5" />
    </Base>
  )
}

/** Tarjetas: la tarjeta y su banda. */
export function IconoTarjetas(p: Props) {
  return (
    <Base {...p}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 9.5h19" />
      <path d="M6 15h4" />
    </Base>
  )
}

/** Patrimonio: cuentas más inversiones, el banco. */
export function IconoPatrimonio(p: Props) {
  return (
    <Base {...p}>
      <path d="M3.5 9.5 12 4l8.5 5.5" />
      <path d="M6 10.5v7M12 10.5v7M18 10.5v7" />
      <path d="M3.5 20.5h17" />
    </Base>
  )
}

/** Plan: el objetivo, la diana. */
export function IconoPlan(p: Props) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 12h.01" />
    </Base>
  )
}

// ── Iconos de acción y estado ──────────────────────────────────────────────
// Los que siguen reemplazan glifos que Poppins tampoco trae (✎ ✕ ⚠ ✓ ← → ▴ ▾)
// y que, con la fuente nueva, caían a la pila del sistema. Heredan currentColor
// igual que los del nav.

const DIRECCION = {
  der:    'm9 5 7 7-7 7',
  izq:    'm15 5-7 7 7 7',
  arriba: 'm5 15 7-7 7 7',
  abajo:  'm5 9 7 7 7-7',
} as const

/** Chevron. Una sola flecha para atrás, adelante, expandir y contraer. */
export function IconoChevron({ direccion = 'der', ...p }: Props & { direccion?: keyof typeof DIRECCION }) {
  return <Base {...p}><path d={DIRECCION[direccion]} /></Base>
}

/** Editar: el lápiz. */
export function IconoEditar(p: Props) {
  return (
    <Base {...p}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </Base>
  )
}

/** Cerrar / quitar: la equis. */
export function IconoCerrar(p: Props) {
  return <Base {...p}><path d="M6 6l12 12M18 6 6 18" /></Base>
}

/** Atención: el triángulo. Hereda el color del texto (danger/warning). */
export function IconoAlerta(p: Props) {
  return (
    <Base {...p}>
      <path d="M12 4 2.7 20h18.6z" />
      <path d="M12 10v4" />
      <path d="M12 17.5h.01" />
    </Base>
  )
}

/** Hecho: el visto. */
export function IconoCheck(p: Props) {
  return <Base {...p}><path d="M5 12.5 9.5 17 19 7" /></Base>
}

/** Más: el botón de nuevo movimiento (FAB). */
export function IconoMas(p: Props) {
  return <Base {...p}><path d="M12 5v14M5 12h14" /></Base>
}

/** Ajustes: el engranaje. Vive en el título de Resumen desde que no hay header. */
export function IconoAjustes(p: Props) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Base>
  )
}

/** Exportar: la flecha que baja a la bandeja. */
export function IconoExportar(p: Props) {
  return (
    <Base {...p}>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
      <path d="M5 19h14" />
    </Base>
  )
}

/** Entra plata: la flecha que baja hacia la izquierda (a vos). */
export function IconoIngreso(p: Props) {
  return <Base {...p}><path d="M17 7 7 17M7 9v8h8" /></Base>
}

/** Sale plata: la flecha que sube hacia la derecha. */
export function IconoGasto(p: Props) {
  return <Base {...p}><path d="M7 17 17 7M9 7h8v8" /></Base>
}

/** Ahorro: la alcancía reducida a una hucha con ranura. */
export function IconoAhorro(p: Props) {
  return (
    <Base {...p}>
      <path d="M5 11a7 6 0 0 1 12.5-3.5H20v4l-1.6.8A7 6 0 0 1 14 16.8V19h-3v-1.6a7 6 0 0 1-2 0V19H6v-2.8A6 6 0 0 1 5 11z" />
      <path d="M10 7.5h3" />
    </Base>
  )
}

/** Buscar: la lupa. */
export function IconoBuscar(p: Props) {
  return <Base {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Base>
}
