import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
// Los colores del manifest salen de los tokens, como todo lo demás. Antes
// `theme_color` era '#0a0b0f', que no es ningún token: había derivado.
import { colores } from './src/lib/tokens'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // `prompt` y no `autoUpdate`: la versión nueva queda esperando y la
      // activa `src/registrarSW.ts` en un momento seguro (nunca con una hoja
      // abierta). Con `autoUpdate` el SW nuevo toma el control apenas se
      // instala, pero la página sigue corriendo el JS viejo hasta la próxima
      // carga — que en una PWA de iOS puede no llegar en días.
      registerType: 'prompt',
      // El registro lo hace `src/registrarSW.ts` (módulo virtual, con chequeo
      // de actualizaciones). El `registerSW.js` inyectado solo registraba.
      injectRegister: false,
      // Sin fuentes propias que precachear: la app usa SF Pro, la del sistema.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
      // `icons.svg` se fue: era un sprite de iconos de redes sociales de la
      // plantilla de Vite, sin un solo uso en `src/`, y estaba precacheándose.
      includeAssets: ['favicon.svg', 'marca.svg', 'marca-maskable.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Vorta — Finanzas Personales',
        short_name: 'Vorta',
        description: 'Control de finanzas personales para Guatemala',
        theme_color: colores.bg,
        background_color: colores.bg,
        display: 'standalone',
        start_url: '/',
        scope: '/',
        // El `maskable` es un archivo DISTINTO, con el glifo más chico. Antes
        // las tres entradas apuntaban a dos archivos y la tercera declaraba el
        // mismo PNG como 'any maskable': Android recorta al 80% central, así
        // que ese ícono salía mordido en los launchers con recorte agresivo.
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      }
    })
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
