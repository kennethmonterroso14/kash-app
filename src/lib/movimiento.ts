import { curvasBezier, duraciones } from './tokens'

/**
 * La capa de Motion sobre los tokens. Vive en `.ts` y no en `tokens.js` porque
 * `tailwind.config.js` importa ese archivo y no puede importar TypeScript; acá
 * sí se pueden tipar las tuplas y los resortes como Motion los quiere.
 *
 * Nada de números nuevos: las curvas salen de `curvasBezier` y los segundos de
 * `duraciones`. Un cambio de token mueve las clases de Tailwind Y el
 * movimiento, que es el punto de que los tokens sean uno.
 */

/** `'280ms'` → `0.28`. Motion mide en segundos. */
const seg = (ms: string) => parseInt(ms, 10) / 1000

export const SALIDA = curvasBezier.salida

export const DUR = {
  presion: seg(duraciones.presion),
  rapida:  seg(duraciones.rapida),
  normal:  seg(duraciones.normal),
  lenta:   seg(duraciones.lenta),
}

/**
 * Resorte de hoja. `apple-design` §4 da damping 0.8 / response 0.3 para una
 * hoja, que en la API de Motion es `bounce` 0.2 y `duration` 0.3 — el rebote
 * mínimo que hace que la hoja se sienta con masa sin parecer un juguete.
 *
 * Es un resorte y no una duración porque la hoja se arrastra: §3 pide que se
 * pueda agarrar a media animación y devolverla, y un resorte arranca del valor
 * que está en pantalla en vez de saltar al del principio.
 */
export const RESORTE_HOJA = { type: 'spring' as const, bounce: 0.2, duration: 0.3 }

/**
 * Proyección de momento de Apple (§6), tal cual del código de *Designing Fluid
 * Interfaces*: adónde llegaría el dedo si lo dejaras correr. Se decide con el
 * punto proyectado y no con el desplazamiento al soltar, que es lo que hace que
 * un golpe corto y rápido descarte la hoja igual que un arrastre largo y lento.
 *
 * Ojo: la fórmula de manual `v²/(2·a)` NO es esta; Apple usa el decaimiento
 * exponencial de abajo.
 */
export const proyectar = (velocidad: number, decaimiento = 0.998) =>
  (velocidad / 1000) * decaimiento / (1 - decaimiento)

/**
 * ¿Se descarta la hoja al soltar? Se decide con el punto PROYECTADO (§6) y no
 * con el desplazamiento: un golpe corto y rápido llega igual de lejos que un
 * arrastre largo y lento, y el gesto dice lo mismo en los dos casos.
 *
 * Está acá y no dentro del componente para poder probarla: es la regla del
 * gesto, y "un empujoncito descarta la hoja entera" es justo el defecto que
 * aparece si el umbral queda mal.
 */
export const descartaHoja = (
  { desplazamiento, velocidad, alto, umbral = 0.4 }:
  { desplazamiento: number; velocidad: number; alto: number; umbral?: number },
) => alto > 0 && desplazamiento + proyectar(velocidad) > alto * umbral
