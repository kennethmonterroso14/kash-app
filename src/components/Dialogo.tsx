import { useCallback, useId, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useCerrarConEscape } from '../hooks/useCerrarConEscape'
import { DUR, SALIDA, useMenosMovimiento } from '../lib/movimiento'

interface Props {
  titulo: ReactNode
  onCerrar: () => void
  children: ReactNode
}

/**
 * Diálogo de confirmación: aparece en el centro, no desde abajo.
 *
 * Es un componente aparte de `Hoja` y no una prop de ella. Una hoja entra desde
 * abajo y un diálogo aparece en el centro: `apple-design` §7 pide que lo que
 * entra por un lado salga por el mismo, así que son dos animaciones con
 * orígenes distintos, y una prop `variante` las esconde.
 *
 * **No cierra con el scrim**, a diferencia de `Hoja`: un diálogo pide una
 * decisión y descartarlo por tocar al lado es demasiado fácil. Escape sí
 * cierra — en Apple equivale a "Cancelar", y sin él no hay salida por teclado.
 * Por lo mismo no se arrastra: si no se descarta tocando al lado, tampoco
 * tirándolo.
 *
 * ## El movimiento
 *
 * Transición y no resorte: no hay gesto que lo pueda interrumpir ni velocidad
 * que traspasar, así que un resorte solo agregaría rebote a algo que no lo
 * pidió (§4 — el rebote se reserva para lo que traía momento).
 *
 * Crece de `0.96`, no de `0`: nada en el mundo real aparece de la nada. Y
 * `transform-origin` queda en el centro, que es la excepción de §7 para lo que
 * no está anclado a un disparador.
 */
export default function Dialogo({ titulo, onCerrar, children }: Props) {
  const id = useId()
  const reducido = useMenosMovimiento()
  const [visible, setVisible] = useState(true)

  const cerrar = useCallback(() => setVisible(false), [])
  useCerrarConEscape(cerrar)

  // Con movimiento reducido queda el fundido y se va la escala (§14).
  const transicion = { duration: DUR.rapida, ease: SALIDA }
  const oculto = reducido ? { opacity: 0 } : { opacity: 0, scale: 0.96 }
  const puesto = { opacity: 1, scale: 1 }

  return (
    <AnimatePresence onExitComplete={onCerrar}>
      {visible && (
        <motion.div
          className="fixed inset-0 scrim flex items-center justify-center z-50 px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transicion}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-titulo`}
            className="vidrio-hoja rounded-tarjeta p-6 max-w-sm w-full max-h-[92dvh] overflow-y-auto overscroll-contain"
            initial={oculto}
            animate={puesto}
            exit={oculto}
            transition={transicion}
          >
            <h2 id={`${id}-titulo`} className="text-text font-semibold mb-2 tracking-titulo">{titulo}</h2>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
