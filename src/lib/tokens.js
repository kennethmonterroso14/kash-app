/**
 * Tokens de diseño — FUENTE ÚNICA.
 *
 * Está en .js (y no en .ts) a propósito: `tailwind.config.js` la importa, y una
 * config de Tailwind no puede importar TypeScript. Los tipos viven en
 * tokens.d.ts, así que desde TS se usa con autocompletado igual.
 *
 * Por qué existe: Recharts necesita colores REALES en sus props (tick fill,
 * activeDot, …), no clases de Tailwind. Antes esos valores estaban copiados
 * como hex en cada gráfica, así que cambiar la paleta dejaba las gráficas con
 * los colores viejos. Ahora un cambio acá mueve TODO: clases y gráficas.
 *
 * Las reglas detrás de estos valores están en `.claude/skills/apple-design`:
 * materiales y profundidad (§12), curvas y resortes (§4–§6), tracking por
 * tamaño (§15). Si vas a cambiar un número acá, leé la sección primero.
 */

/** Paleta base. Los semánticos de estado son los system colors de iOS en oscuro. */
export const colores = {
  bg:        '#06070a',
  surface:   '#12141a',
  surface2:  '#1b1e26',
  accent:    '#7c6af7',
  accentAlt: '#a78bfa',
  success:   '#30d158',
  danger:    '#ff453a',
  warning:   '#ff9f0a',
  text:      '#f2f3f7',
  textDim:   '#9aa0b0',
}

/**
 * Materiales translúcidos (apple-design §12).
 *
 * Son capas que dejan pasar el contenido de abajo, no fondos opacos: el peso
 * del material codifica jerarquía. `chip` es el más liviano y va en cosas
 * interactivas; `chrome` es el más pesado y separa regiones estructurales
 * (header, nav). REGLA: nunca apilar un material liviano sobre otro liviano —
 * la legibilidad se cae.
 *
 * El desenfoque va aparte porque Tailwind los expone en escalas distintas
 * (`bg-*` y `backdrop-blur-*`), pero se usan de a pares: ver las utilidades
 * `.vidrio-*` en index.css, que son la única forma en que estos entran a la UI.
 */
export const materiales = {
  chip:   'rgba(27, 30, 38, 0.44)',
  panel:  'rgba(18, 20, 26, 0.62)',
  chrome: 'rgba(12, 14, 19, 0.72)',
  hoja:   'rgba(18, 20, 26, 0.84)',
  /** Scrim de una tarea modal: oscurece para enfocar (§12 "dim to focus"). */
  scrim:  'rgba(3, 4, 6, 0.55)',
}

/** Radio del desenfoque por material. Superficie más grande = material más grueso. */
export const desenfoques = {
  chip:   '12px',
  panel:  '20px',
  chrome: '28px',
  hoja:   '40px',
}

/**
 * Bordes del material: el de arriba es más claro porque es la luz pegando en
 * el canto del vidrio. No son bordes de 1px sólidos de separación — eso es lo
 * que §12 pide reemplazar por el material y el degradado de borde de scroll.
 */
export const bordesVidrio = {
  canto:     'rgba(242, 243, 247, 0.14)',
  perimetro: 'rgba(242, 243, 247, 0.08)',
}

/** Sombras. Más grande la superficie, más profunda la sombra (§12). */
export const sombras = {
  chip:   '0 1px 2px rgba(0, 0, 0, 0.30)',
  panel:  '0 8px 24px -8px rgba(0, 0, 0, 0.55)',
  /** El nav flota sobre el contenido, así que su sombra va hacia arriba. */
  chrome: '0 -10px 32px -12px rgba(0, 0, 0, 0.70)',
  hoja:   '0 24px 64px -16px rgba(0, 0, 0, 0.80)',
}

/**
 * Curvas. `salida` es la de entrada de elementos (empieza rápido y frena), y
 * `entrada` es su inversa exacta, para que una transición reversible vuelva
 * por el mismo camino (§7 "mirror the easing").
 */
export const curvas = {
  salida:   'cubic-bezier(0.22, 1, 0.36, 1)',
  entrada:  'cubic-bezier(0.78, 0, 0.64, 1)',
  estandar: 'cubic-bezier(0.4, 0, 0.2, 1)',
}

/** Duraciones. `presion` es el feedback de `:active`: 100–160ms o se siente lento. */
export const duraciones = {
  presion: '110ms',
  rapida:  '180ms',
  normal:  '280ms',
  lenta:   '420ms',
}

/**
 * Radios. Grandes y sin escalones chicos: las esquinas de iOS son continuas y
 * un radio de 4px lee como web, no como app.
 */
export const radios = {
  chip:    '10px',
  control: '14px',
  panel:   '20px',
  tarjeta: '26px',
  hoja:    '34px',
}

/**
 * Tracking por tamaño (§15). Un solo `letter-spacing` para todo está mal en
 * algún tamaño: el texto grande se ve separado y hay que apretarlo, el chico
 * se ve apretado y hay que abrirlo.
 */
export const tracking = {
  display: '-0.024em',
  titulo:  '-0.016em',
  base:    '0em',
  micro:   '0.012em',
}

/**
 * Colores que el USUARIO elige para sus cuentas y tarjetas. Es data, no
 * decoración: se guardan en la base y no deben cambiar si cambia el tema.
 */
export const paletaDatos = [
  '#4ade80', '#34d399', '#60a5fa', '#a78bfa', '#e879f9',
  '#fbbf24', '#fb923c', '#f472b6', '#ff7c5c', '#67e8f9',
  '#c8f564', '#facc15', '#94a3b8', '#86efac', '#c4b5fd',
]
