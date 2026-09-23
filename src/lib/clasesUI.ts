/**
 * Las clases del control de formulario, en un solo lugar.
 *
 * Ya no es un paliativo: desde la tarea 3.2 el único que la lee es `Campo`, y
 * ningún sitio de llamada la importa. Sigue viviendo acá y no dentro del
 * componente porque `tailwind.config.js` necesita ver la cadena literal, y
 * porque es la definición del control, no de ese componente.
 *
 * Ojo con el tamaño de letra: el piso de 16px en táctil lo pone `index.css` con
 * `!important`, porque una utilidad como `text-sm` le gana a la capa base.
 */
export const CLASE_INPUT =
  'bg-vidrio-relleno border border-canto rounded-control px-4 py-3 text-text text-sm ' +
  'placeholder:text-textDim focus:outline-none focus:border-accent'

/**
 * El botón redondo de vidrio que acompaña al título grande (Ajustes, exportar,
 * nuevo): 44 pt de blanco táctil, el mínimo de la HIG.
 */
export const CLASE_BOTON_TITULO =
  'presionable grid place-items-center w-11 h-11 rounded-full vidrio-chip text-text ' +
  'disabled:opacity-30'
