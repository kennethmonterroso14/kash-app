// Matchers de jest-dom (toHaveTextContent, toBeInTheDocument, …) para Vitest.
import '@testing-library/jest-dom/vitest'

/**
 * Motion corre sus animaciones con rAF, así que en jsdom un `onExitComplete`
 * tardaría frames en llegar o no llegaría nunca. Con esto las animaciones
 * terminan de inmediato: lo que se prueba es la máquina de estados (que cerrar
 * avise al padre, que Escape cierre una sola capa), no los frames.
 *
 * El movimiento en sí no se prueba acá — se mira, y eso es a mano.
 */
import { MotionGlobalConfig } from 'motion/react'
MotionGlobalConfig.skipAnimations = true
