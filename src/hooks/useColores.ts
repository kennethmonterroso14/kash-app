import { useSyncExternalStore } from 'react'
import { temas, type PaletaColores } from '../lib/tokens'

const CONSULTA = '(prefers-color-scheme: light)'
const hayMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'

function suscribir(avisar: () => void) {
  if (!hayMedia()) return () => {}
  const m = window.matchMedia(CONSULTA)
  m.addEventListener('change', avisar)
  return () => m.removeEventListener('change', avisar)
}
const esClaro = () => hayMedia() && window.matchMedia(CONSULTA).matches

/**
 * La paleta del tema ACTIVO como colores reales. Solo para lo que no puede usar
 * las clases de Tailwind (que ya siguen al tema solas vía variables CSS): las
 * props de Recharts (`fill`, `stroke`, `tick`) y algún `style` calculado. Se
 * actualiza sola si el usuario cambia el tema del sistema con la app abierta.
 */
export function useColores(): PaletaColores {
  return useSyncExternalStore(suscribir, esClaro, () => false) ? temas.claro.colores : temas.oscuro.colores
}
