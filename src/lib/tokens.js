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

/**
 * Los dos temas. La app sigue al del sistema (`prefers-color-scheme`), como las
 * de Apple. Cada tema es una paleta completa, no una inversión: en claro el
 * acento, el éxito, el aviso y el peligro se oscurecen para llegar a 4.5:1 sobre
 * blanco, y en oscuro el acento se aclara para que el texto oscuro encima (los
 * botones son `bg-accent text-bg`) también pase.
 *
 * Los componentes NO leen esto directo: `tailwind.config.js` lo vuelca a
 * variables CSS (`--c-*` colores, `--m-*` materiales, `--b-*` bordes, `--s-*`
 * sombras) en `:root` y en la media query de claro, y las clases apuntan a las
 * variables. Así el mismo `bg-accent/15` sirve a los dos temas sin tocar ni un
 * componente. Lo que necesita un color REAL en una prop (las gráficas de
 * Recharts) usa `useColores()`, que devuelve la paleta del tema activo.
 *
 * `brillo2` es el segundo color de los halos del fondo (el primero es el acento):
 * el Liquid Glass necesita color detrás para tener qué refractar.
 */
export const temas = {
  oscuro: {
    colores: {
      bg:        '#05060a',
      surface:   '#15161d',
      surface2:  '#20212b',
      accent:    '#8b7bff',
      accentAlt: '#b3a7ff',
      success:   '#32d74b',
      danger:    '#ff453a',
      warning:   '#ff9f0a',
      text:      '#f5f5f7',
      textDim:   '#a3a3b0',
      brillo2:   '#2f6bff',
    },
    /** Intensidad de los tres halos del fondo. */
    brillos: [0.44, 0.32, 0.26],
    materiales: {
      chip:     'rgba(255, 255, 255, 0.07)',
      panel:    'rgba(255, 255, 255, 0.075)',
      chrome:   'rgba(22, 22, 30, 0.62)',
      flotante: 'rgba(34, 34, 44, 0.58)',
      hoja:     'rgba(26, 26, 34, 0.80)',
      scrim:    'rgba(0, 0, 0, 0.45)',
      // Relleno de controles dentro del vidrio (campos, rieles, barras): el
      // tertiarySystemFill de iOS. Sin desenfoque — no es una capa, es tinta.
      relleno:  'rgba(118, 118, 128, 0.24)',
      // La píldora del control segmentado: un vidrio más claro que su riel.
      segmento: 'rgba(255, 255, 255, 0.16)',
    },
    bordesVidrio: {
      canto:     'rgba(255, 255, 255, 0.18)',
      perimetro: 'rgba(255, 255, 255, 0.12)',
    },
    sombras: {
      chip:     '0 1px 2px rgba(0, 0, 0, 0.30)',
      panel:    '0 14px 34px -12px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.10)',
      chrome:   '0 -10px 32px -12px rgba(0, 0, 0, 0.70)',
      flotante: '0 12px 36px -10px rgba(0, 0, 0, 0.72), inset 0 1px 0 rgba(255, 255, 255, 0.14)',
      hoja:     '0 24px 64px -16px rgba(0, 0, 0, 0.80)',
    },
  },
  claro: {
    colores: {
      bg:        '#eceef5',
      surface:   '#ffffff',
      surface2:  '#f2f2f7',
      accent:    '#5b48d9',
      accentAlt: '#7c6af7',
      success:   '#17803a',
      danger:    '#d92d20',
      warning:   '#b35c00',
      text:      '#111114',
      textDim:   '#5d5d69',
      brillo2:   '#7aa8ff',
    },
    brillos: [0.30, 0.22, 0.18],
    materiales: {
      chip:     'rgba(255, 255, 255, 0.55)',
      panel:    'rgba(255, 255, 255, 0.58)',
      chrome:   'rgba(255, 255, 255, 0.72)',
      flotante: 'rgba(255, 255, 255, 0.72)',
      hoja:     'rgba(247, 247, 251, 0.88)',
      scrim:    'rgba(20, 20, 40, 0.22)',
      relleno:  'rgba(118, 118, 128, 0.12)',
      segmento: 'rgba(255, 255, 255, 0.96)',
    },
    bordesVidrio: {
      canto:     'rgba(255, 255, 255, 0.95)',
      perimetro: 'rgba(255, 255, 255, 0.80)',
    },
    sombras: {
      chip:     '0 1px 2px rgba(38, 38, 90, 0.10)',
      panel:    '0 10px 30px -12px rgba(38, 38, 90, 0.18), inset 0 1px 0 rgba(255, 255, 255, 1)',
      chrome:   '0 -8px 24px -12px rgba(38, 38, 90, 0.16)',
      flotante: '0 12px 32px -10px rgba(38, 38, 90, 0.24), inset 0 1px 0 rgba(255, 255, 255, 1)',
      hoja:     '0 24px 64px -16px rgba(38, 38, 90, 0.28)',
    },
  },
}

/**
 * La paleta oscura como valores fijos, para lo que no puede seguir al tema: el
 * manifest de la PWA (`theme_color`, `background_color`) se escribe una vez en
 * el build. Todo lo que se pinta en pantalla va por las variables o `useColores()`.
 */
export const colores = temas.oscuro.colores

/**
 * Radio del desenfoque por material. Superficie más grande = material más grueso.
 * Las utilidades `.vidrio-*` de index.css los combinan con su material; ver
 * apple-design §12: nunca apilar un material liviano sobre otro liviano.
 */
export const desenfoques = {
  chip:     '12px',
  panel:    '24px',
  chrome:   '28px',
  flotante: '30px',
  hoja:     '40px',
}

/**
 * La familia tipográfica: SF Pro, la del sistema. En un iPhone es la de las apps
 * de Apple, pesa 0 KB (no se descarga nada) y trae cifras tabulares, así que
 * `tabular-nums` en los montos alinea las columnas de verdad. Reemplaza a
 * Poppins, que no tenía `tnum` (los montos bailaban ~23 px) y costaba 31 KB.
 * Fuera de Apple cae a la fuente del sistema de cada plataforma.
 *
 * `mono` queda solo para el volcado técnico del ErrorBoundary.
 */
const PILA_SISTEMA = [
  '-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'SF Pro Display', 'system-ui',
  'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif',
]

export const fuentes = {
  principal: PILA_SISTEMA,
  mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'monospace'],
}

export const curvasBezier = {
  salida:   [0.22, 1, 0.36, 1],
  entrada:  [0.78, 0, 0.64, 1],
  estandar: [0.4, 0, 0.2, 1],
}

const bezier = ([a, b, c, d]) => `cubic-bezier(${a}, ${b}, ${c}, ${d})`

export const curvas = {
  salida:   bezier(curvasBezier.salida),
  entrada:  bezier(curvasBezier.entrada),
  estandar: bezier(curvasBezier.estandar),
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
