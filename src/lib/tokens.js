/**
 * Paleta de la app — FUENTE ÚNICA.
 *
 * Está en .js (y no en .ts) a propósito: `tailwind.config.js` la importa, y una
 * config de Tailwind no puede importar TypeScript. Los tipos viven en
 * tokens.d.ts, así que desde TS se usa con autocompletado igual.
 *
 * Por qué existe: Recharts necesita colores REALES en sus props (tick fill,
 * activeDot, …), no clases de Tailwind. Antes esos valores estaban copiados
 * como hex en cada gráfica, así que cambiar la paleta dejaba las gráficas con
 * los colores viejos. Ahora un cambio acá mueve TODO: clases y gráficas.
 */
export const colores = {
  bg:        '#0a0c10',
  surface:   '#12151c',
  surface2:  '#1a1e28',
  accent:    '#7c6af7',
  accentAlt: '#a78bfa',
  success:   '#4ade80',
  danger:    '#f87171',
  warning:   '#fbbf24',
  muted:     '#3d4255',
  text:      '#e8eaf0',
  textDim:   '#8b90a0',
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
