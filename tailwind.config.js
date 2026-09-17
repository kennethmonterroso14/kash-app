import {
  colores, materiales, desenfoques, bordesVidrio,
  sombras, curvas, duraciones, radios, tracking,
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
      fontFamily: {
        // La fuente del sistema antes que una propia (apple-design §15): trae
        // su propio optical sizing y tablas de tracking, y dentro del WebView
        // de Capacitor en iOS esto es SF Pro de verdad. Outfit queda solo para
        // el logotipo.
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Inter',
               'Segoe UI', 'Roboto', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo',
               'JetBrains Mono', 'monospace'],
        display: ['Outfit', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
