import { useCallback, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import {
  animate,
  AnimatePresence,
  motion,
  useDragControls,
  useMotionValue,
  useTransform,
} from 'motion/react'
import { useCerrarConEscape } from '../hooks/useCerrarConEscape'
import { descartaHoja, DUR, RESORTE_HOJA, SALIDA, useMenosMovimiento } from '../lib/movimiento'

interface Props {
  titulo: ReactNode
  onCerrar: () => void
  children: ReactNode
}

/**
 * Hoja modal: entra desde abajo, ocupa el ancho en móvil y se limita a
 * `max-w-lg` centrada en pantallas anchas.
 *
 * Reemplaza las cinco variantes del mismo contenedor que había en catorce
 * archivos (`p-5` vs `p-6`, con y sin `max-w-lg`, con y sin scroll). Las
 * diferencias no las decidió nadie, así que acá hay una sola forma:
 *
 * - `p-6` con el bottom compensado por el área segura — la hoja llega al borde
 *   inferior de la pantalla, y sin esa compensación el último botón queda bajo
 *   el indicador de home.
 * - `max-h-[92dvh]` + scroll con `overscroll-contain` siempre, no solo en las
 *   hojas que hoy son largas: cualquiera lo es con el teclado abierto.
 *   `dvh` y no `vh` porque la barra de Safari cambia de alto.
 * - `space-y-4` entre el encabezado y el contenido. Al migrar las hojas que
 *   usaban `mb-*` en cada hijo hay que quitarlos, o el espacio se suma.
 * - El título va `truncate` y el ✕ `shrink-0`: tres hojas ya lo pedían porque
 *   el título lleva el nombre de la cuenta o la tarjeta, y las otras dejaban
 *   que un nombre largo empujara el ✕ fuera de la hoja.
 *
 * ## El movimiento
 *
 * Entra desde abajo y sale por abajo: `apple-design` §7 pide que lo que entra
 * por un lado salga por el mismo, y es lo que hace obvio que se descarta
 * arrastrándola. Con resorte y no con duración porque se puede agarrar a media
 * animación (§3): un resorte arranca del valor que está en pantalla, una
 * transición salta al del principio.
 *
 * **Se arrastra desde el asa y el título, no desde toda la hoja.** La hoja ES
 * el contenedor de scroll, así que un `drag` sobre ella le robaría el scroll al
 * contenido. El asa además es la señal de que se puede arrastrar; el ✕ queda
 * fuera de la zona para que un toque en él no empiece un gesto.
 *
 * El descarte se decide con la **proyección de momento** de §6 y no con el
 * desplazamiento al soltar: así un golpe corto y rápido descarta igual que un
 * arrastre largo y lento. Hacia arriba hay rubber-banding (§9) en vez de un
 * muro, y al soltar sin descartar la hoja vuelve con la velocidad del dedo
 * (§5), sin costura entre el arrastre y la animación.
 *
 * El scrim se aclara mientras arrastrás, 1:1 con el dedo (§2): es lo que dice
 * que el gesto va a descartar y no a mover. Se multiplica con el fundido de
 * entrada porque son dos capas anidadas, no dos escritores del mismo valor.
 *
 * **Lo que NO se anima:** cuando un formulario guarda bien, el modal llama al
 * `onCerrar` de la página y desmonta de golpe. La hoja no puede interceptar esa
 * llamada — le llega al padre, no a ella — y hacerlo costaría convertir los
 * catorce `children` en una render-prop. Un cierre instantáneo después de
 * guardar se lee como "listo" y no como una falla, así que se queda así.
 */
export default function Hoja({ titulo, onCerrar, children }: Props) {
  const id = useId()
  const reducido = useMenosMovimiento()
  const controles = useDragControls()
  const y = useMotionValue(0)
  const hoja = useRef<HTMLDivElement>(null)
  // En ref y no en estado: la transformación del scrim corre en cada frame, así
  // que lee el valor fresco sin provocar un render a mitad del gesto.
  const alto = useRef(0)
  const [visible, setVisible] = useState(true)

  // El cierre lo pide la hoja; el padre se entera cuando termina la salida.
  const cerrar = useCallback(() => setVisible(false), [])
  useCerrarConEscape(cerrar)

  const opacidadScrim = useTransform(y, v =>
    alto.current > 0 ? Math.max(0, 1 - v / alto.current) : 1,
  )

  const iniciarArrastre = (e: PointerEvent) => controles.start(e)
  const medir = () => { alto.current = hoja.current?.offsetHeight ?? 0 }

  const alSoltar = (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
    if (alto.current === 0) return
    if (descartaHoja({
      desplazamiento: info.offset.y, velocidad: info.velocity.y, alto: alto.current,
    })) {
      cerrar()
      return
    }
    // Vuelta a su lugar arrancando de la velocidad del dedo. Retarget explícito
    // del resorte: Motion ya había empezado a devolverla al soltar, y un
    // resorte que arranca del valor en pantalla no salta al reemplazarse.
    animate(y, 0, { ...RESORTE_HOJA, velocity: info.velocity.y })
  }

  return (
    <AnimatePresence onExitComplete={onCerrar}>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          // El fundido va con duración y no con el resorte: la opacidad no
          // arrastra momento de ningún lado, y un resorte con rebote la pasaría
          // de 1 antes de asentarse.
          transition={{ duration: DUR.rapida, ease: SALIDA }}
        >
          {/* El scrim es su propia capa: su opacidad la escribe el arrastre, y
              el fundido de apertura vive en el contenedor. Anidadas se
              multiplican; sobre el mismo elemento se pelearían. */}
          <motion.div
            className="absolute inset-0 scrim"
            style={{ opacity: opacidadScrim }}
            onClick={cerrar}
          />

          <motion.div
            ref={hoja}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-titulo`}
            className="relative vidrio-hoja w-full max-w-lg rounded-t-hoja pt-2 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] space-y-4 max-h-[92dvh] overflow-y-auto overscroll-contain"
            style={{ y }}
            // Con movimiento reducido la hoja aparece donde va a quedarse: se
            // mantiene el fundido del contenedor, que es el que dice que algo
            // se abrió, y se quita el desplazamiento (§14).
            initial={reducido ? false : { y: '100%' }}
            animate={reducido ? {} : { y: 0 }}
            exit={reducido ? {} : { y: '100%' }}
            transition={RESORTE_HOJA}
            drag="y"
            dragControls={controles}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            // Arriba casi no cede (rubber-banding); abajo sigue al dedo 1:1.
            dragElastic={{ top: 0.04, bottom: 1, left: 0, right: 0 }}
            dragMomentum={false}
            onDragStart={medir}
            onDragEnd={alSoltar}
          >
            {/* El asa y el título en un bloque, fuera del `space-y-4`, para que
                el título siga arrancando a 24px del borde como con `p-6`. */}
            <div>
              <div
                onPointerDown={iniciarArrastre}
                className="touch-none pb-3 -mx-6 px-6 cursor-grab active:cursor-grabbing"
              >
                <div aria-hidden="true" className="mx-auto h-1 w-9 rounded-full bg-textDim/40" />
              </div>
              <div className="flex justify-between items-center gap-3">
                <h2
                  id={`${id}-titulo`}
                  onPointerDown={iniciarArrastre}
                  className="touch-none text-text font-semibold tracking-titulo truncate cursor-grab active:cursor-grabbing"
                >
                  {titulo}
                </h2>
                <button onClick={cerrar} aria-label="Cerrar" className="presionable text-textDim text-xl shrink-0">×</button>
              </div>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
