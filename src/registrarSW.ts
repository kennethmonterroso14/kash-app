/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register'
import { crearAplicador, hayHojaAbierta } from './lib/actualizacion'

/**
 * Registro del service worker CON actualización. Ver `lib/actualizacion.ts`
 * para el porqué; acá solo se cablea.
 *
 * `registerType: 'prompt'` (vite.config.ts) hace que la versión nueva quede
 * ESPERANDO en lugar de activarse sola: quien decide el momento es el
 * aplicador, que nunca recarga con una hoja abierta. `actualizar(true)` le dice
 * al SW nuevo que se active y recarga la página.
 */
const actualizar = registerSW({
  immediate: true,
  onNeedRefresh: crearAplicador(() => { void actualizar(true) }, hayHojaAbierta),
  onRegisteredSW(_url, registro) {
    if (!registro) return
    // iOS reanuda una PWA de la pantalla de inicio desde memoria, SIN navegar,
    // y sin navegación el navegador nunca vuelve a mirar si hay un `sw.js`
    // nuevo. Se mira a mano al volver al frente, que es cuando importa.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registro.update()
    })
    // Y cada hora, para una sesión que queda abierta mucho tiempo.
    setInterval(() => { void registro.update() }, 60 * 60 * 1000)
  },
})
