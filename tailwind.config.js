import { colores } from './src/lib/tokens.js'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // La paleta vive en src/lib/tokens.js para que las gráficas (que
      // necesitan colores reales, no clases) usen exactamente la misma.
      colors: colores,
      fontFamily: {
        sans:    ['Inter', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
        display: ['Outfit', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
