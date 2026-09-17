/**
 * Clases repetidas de Tailwind, en un solo lugar.
 *
 * Es un paliativo, no la capa de componentes: los primitivos (`Field`, `Sheet`,
 * `Money`, …) son la tarea 3.2 del roadmap, y se hacen DESPUÉS de partir las
 * páginas para no abstraer sobre la estructura equivocada. Hasta entonces, esto
 * evita que la misma cadena de 130 caracteres viva copiada en veinte archivos y
 * se desincronice.
 *
 * Ojo con el tamaño de letra: el piso de 16px en táctil lo pone `index.css` con
 * `!important`, porque una utilidad como `text-sm` le gana a la capa base.
 */
export const CLASE_INPUT =
  'bg-bg border border-canto rounded-control px-4 py-3 text-text text-sm ' +
  'placeholder:text-textDim focus:outline-none focus:border-accent'
