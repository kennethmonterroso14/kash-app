import { COLOR_CATEGORIA_FALLBACK } from '../lib/constants'

interface Props {
  categoria: string
  color?: string
  /** Lado en px. 36 en las listas, como las filas de Wallet. */
  size?: number
}

/**
 * El círculo de una fila (movimiento o cuenta): la inicial en su color,
 * sobre un tinte del mismo color. Reemplaza al puntito de 8px, que no alcanzaba
 * para distinguir categorías de un vistazo.
 *
 * El tinte sale de `color-mix` y no de concatenar un alfa al hex: el color es
 * dato del usuario y no se puede asumir que venga como `#rrggbb`.
 */
export default function AvatarCategoria({ categoria, color, size = 36 }: Props) {
  const c = color ?? COLOR_CATEGORIA_FALLBACK
  return (
    <span
      aria-hidden="true"
      className="grid place-items-center rounded-full shrink-0 font-semibold"
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.42),
        color: c, background: `color-mix(in srgb, ${c} 20%, transparent)`,
      }}
    >
      {categoria.trim().charAt(0).toUpperCase() || '·'}
    </span>
  )
}
