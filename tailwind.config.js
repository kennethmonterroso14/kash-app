import {
  temas, acentos, desenfoques, curvas, duraciones, radios, tracking, fuentes,
} from './src/lib/tokens.js'

/** '#8b7bff' → '139 123 255', la forma que acepta `rgb(var(--x) / <alpha>)`. */
const canales = hex => {
  const n = parseInt(hex.slice(1), 16)
  return `${n >> 16} ${(n >> 8) & 255} ${n & 255}`
}

/**
 * Un tema de tokens.js → sus variables CSS. Los colores van como canales para
 * que los modificadores de opacidad (`bg-accent/15`) sigan funcionando.
 */
const variables = tema => ({
  ...Object.fromEntries(Object.entries(tema.colores).map(([k, v]) => [`--c-${k}`, canales(v)])),
  ...Object.fromEntries(Object.entries(tema.materiales).map(([k, v]) => [`--m-${k}`, v])),
  ...Object.fromEntries(Object.entries(tema.bordesVidrio).map(([k, v]) => [`--b-${k}`, v])),
  ...Object.fromEntries(Object.entries(tema.sombras).map(([k, v]) => [`--s-${k}`, v])),
  ...Object.fromEntries(tema.brillos.map((v, i) => [`--brillo-${i + 1}`, String(v)])),
})

/** Las dos variables que cambia un acento, en canales como el resto. */
const varsAcento = ({ accent, accentAlt }) => ({ '--c-accent': canales(accent), '--c-accentAlt': canales(accentAlt) })

const claves = obj => Object.keys(obj)

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  future: {
    // Compila `hover:` a @media (hover: hover), para que un tap en el teléfono
    // no deje el estado de hover pegado (mobile-native §1).
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      // Todo apunta a variables: el valor lo pone el tema activo (ver el plugin
      // de abajo). tokens.js sigue siendo la única fuente de los números.
      colors: {
        ...Object.fromEntries(claves(temas.oscuro.colores).map(k => [k, `rgb(var(--c-${k}) / <alpha-value>)`])),
        vidrio: Object.fromEntries(claves(temas.oscuro.materiales).map(k => [k, `var(--m-${k})`])),
      },
      borderColor: { canto: 'var(--b-canto)', perimetro: 'var(--b-perimetro)' },
      boxShadow: Object.fromEntries(claves(temas.oscuro.sombras).map(k => [k, `var(--s-${k})`])),
      backdropBlur: desenfoques,
      backdropSaturate: { 180: '1.8' },
      borderRadius: radios,
      letterSpacing: tracking,
      transitionTimingFunction: curvas,
      transitionDuration: duraciones,
      fontFamily: {
        sans: fuentes.principal,
        display: fuentes.principal,
        mono: fuentes.mono,
      },
    },
  },
  plugins: [
    // Las variables de los dos temas. Oscuro es el default; el claro entra con
    // la preferencia del sistema, igual que en las apps de Apple.
    //
    // Encima, el acento que eligió el usuario (`data-acento` en <html>, ver
    // lib/acento.ts): solo pisa `--c-accent` y `--c-accentAlt`, y el selector
    // con atributo gana por especificidad al `:root` pelado. El bloque claro de
    // acentos va DENTRO de la media query y después, así gana en claro.
    ({ addBase }) => addBase({
      ':root': { ...variables(temas.oscuro), colorScheme: 'dark' },
      ...Object.fromEntries(acentos.map(a => [`:root[data-acento="${a.id}"]`, varsAcento(a.oscuro)])),
      '@media (prefers-color-scheme: light)': {
        ':root': { ...variables(temas.claro), colorScheme: 'light' },
        ...Object.fromEntries(acentos.map(a => [`:root[data-acento="${a.id}"]`, varsAcento(a.claro)])),
      },
    }),
  ],
}
