interface Props {
  /** Lado de la caja, en px. El nav usa 22; el default cubre el resto. */
  size?: number
  className?: string
}

/**
 * Iconos dibujados, no glifos. Poppins no trae ◈ ≡ ▭ ◎ ◧ (los cinco del nav),
 * así que un glifo dejaba esos símbolos a merced de la fuente de último recurso
 * del navegador — otro tamaño, otro peso, y distinto en cada plataforma. Un
 * trazo propio es cromo: hereda `currentColor`, así que el destino activo se
 * pinta con `text-accent` sin tocar el icono, y mide igual en iOS, Android y web.
 *
 * Mismo lenguaje que el engranaje del header (`Layout.tsx`): trazo 1.7, sin
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
