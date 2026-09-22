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
      registerType: 'autoUpdate',
      // Los defaults de Workbox precachean js/css/html/ico/png/svg — **no
      // woff2**. Sin esto la fuente se sirve del propio origen pero NO queda
      // disponible sin señal, que era la mitad del motivo de self-hostearla.
      // Verificado: sin `woff2` acá, `dist/sw.js` no menciona ningún .woff2.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      // `icons.svg` se fue: era un sprite de iconos de redes sociales de la
      // plantilla de Vite, sin un solo uso en `src/`, y estaba precacheándose.
      includeAssets: ['favicon.svg', 'marca.svg', 'marca-maskable.svg'],
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
