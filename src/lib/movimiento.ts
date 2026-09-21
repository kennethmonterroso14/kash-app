import { useReducedMotion } from 'motion/react'
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

/**
 * ¿El sistema pide menos movimiento?
 *
 * Cada componente que anima un `transform` pregunta y ramifica. Lo centralizado
 * sería `<MotionConfig reducedMotion="user">` en la raíz, que hace exactamente
 * esto para toda la app — pero **cuesta +37 KB gzip medidos** sobre el bundle:
 * `MotionConfig` arrastra el paquete completo de features de Motion. Para una
 * PWA que se abre en un teléfono no vale, así que se paga en repetición.
 *
 * Lo que hay que hacer en cada uno: quitar el desplazamiento y la escala,
 * dejar la opacidad y el color (`apple-design` §14 — menos movimiento, no
 * cero). El arrastre de la hoja NO se toca: es manipulación directa, no una
 * animación.
 */
export const useMenosMovimiento = () => !!useReducedMotion()

/** Transición para lo que no debe moverse cuando se pide menos movimiento. */
export const AL_INSTANTE = { duration: 0 }

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

/**
 * Resorte del indicador de un riel segmentado. `apple-design` §4 clasifica esto
 * como "mover / reposicionar": damping 1.0, o sea `bounce: 0`. Sin rebote porque
 * al indicador no lo empujó ningún gesto — lo movió un toque, y el rebote se
 * reserva para lo que traía momento.
 *
 * `duration` es la *response* del resorte, no su duración fija. 0.28 y no el 0.4
 * de la tabla de Apple porque ahí el ejemplo es una ventana cruzando la
 * pantalla; acá el viaje es de menos de 100px.
 */
export const RESORTE_SEGMENTO = { type: 'spring' as const, bounce: 0, duration: DUR.normal }

/** `gap-1` y `p-1` del riel, en px. Si cambian las clases, cambia esto. */
const HUECO = 4

/**
 * Dónde va el indicador de un riel segmentado, **sin medir nada**.
 *
 * Las pestañas son `flex-1 min-w-0`, o sea todas del mismo ancho, así que la
 * posición sale de la aritmética y no de leer el DOM. Eso importa: la
 * alternativa obvia es `layoutId` de Motion, que mide las dos posiciones y anima
 * entre ellas — y arrastra el motor de proyección de layout de la librería,
 * **+37 KB gzip** medidos sobre el bundle. Para dos píldoras que se deslizan en
 * un riel de anchos iguales no vale ese precio en una PWA.
 *
 * El `transform` va como cadena completa y en porcentaje: el porcentaje de
 * `translateX` es relativo al ancho del propio elemento, que es justo el ancho
 * de una pestaña, y la cadena completa sí la acelera el compositor (los
 * atajos `x`/`y` de Motion no).
 */
export const posicionIndicador = (indice: number, total: number) => ({
  // El 100% de un absoluto es la caja de padding del contenedor, o sea incluye
  // sus `p-1`: de ahí el `2 * HUECO` que se descuenta antes de repartir.
  width: `calc((100% - ${2 * HUECO}px - ${(total - 1) * HUECO}px) / ${total})`,
  transform: `translateX(calc(${indice} * (100% + ${HUECO}px)))`,
})
