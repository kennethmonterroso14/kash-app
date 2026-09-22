import {
  colores, materiales, desenfoques, bordesVidrio,
  sombras, curvas, duraciones, radios, tracking, fuentes,
} from './src/lib/tokens.js'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  future: {
    // Compila `hover:` a @media (hover: hover), para que un tap en el teléfono
    // no deje el estado de hover pegado (mobile-native §1).
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      // Los tokens viven en src/lib/tokens.js para que las gráficas (que
      // necesitan colores reales, no clases) usen exactamente los mismos.
      colors: { ...colores, vidrio: materiales },
      borderColor: { canto: bordesVidrio.canto, perimetro: bordesVidrio.perimetro },
      backdropBlur: desenfoques,
      boxShadow: sombras,
      borderRadius: radios,
      letterSpacing: tracking,
      transitionTimingFunction: curvas,
      transitionDuration: duraciones,
      // Salen de `fuentes` en tokens.js, que documenta qué se cedió al elegir
      // Poppins y cuál es la alternativa. `sans` y `display` apuntan a la misma
      // familia: la app usa una sola. `display` se conserva como token para que
      // volver a tener una fuente aparte para títulos sea una línea, y para no
      // reescribir los 8 sitios que ya dicen `font-display`.
      fontFamily: {
        sans: fuentes.principal,
        display: fuentes.principal,
        mono: fuentes.mono,
      },
    },
  },
  plugins: [],
}
