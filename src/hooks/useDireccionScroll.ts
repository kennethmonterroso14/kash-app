import { useEffect, useState } from 'react'

/**
 * ¿El usuario está bajando por la página? Sirve para compactar la barra flotante
 * al bajar (más espacio para leer) y devolverla entera al subir o al llegar
 * arriba — el gesto de iOS 26.
 *
 * El documento es el contenedor de scroll de la app (no hay un `overflow` en
 * `main`), así que se escucha `window`. Listener pasivo y con umbral para no
 * parpadear con micro-movimientos ni con el rebote elástico del borde.
 *
 * Cerca del tope siempre devuelve `false`: la barra tiene que estar entera
 * cuando no hay nada scrolleado, pase lo que pase con la última dirección.
 */
export function useDireccionScroll(umbral = 8) {
  const [bajando, setBajando] = useState(false)

  useEffect(() => {
    let ultimo = window.scrollY
    let pendiente = false

    const evaluar = () => {
      pendiente = false
      const y = window.scrollY
      if (y < 16) { setBajando(false); ultimo = y; return }
      if (Math.abs(y - ultimo) < umbral) return
      setBajando(y > ultimo)
      ultimo = y
    }

    // rAF: agrupa la ráfaga de eventos de scroll en un cálculo por frame.
    const onScroll = () => {
      if (pendiente) return
      pendiente = true
      requestAnimationFrame(evaluar)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [umbral])

  return bajando
}
