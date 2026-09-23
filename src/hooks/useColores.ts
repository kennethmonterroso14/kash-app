import { useMemo, useSyncExternalStore } from 'react'
import { acentos, temas, type PaletaColores } from '../lib/tokens'
import { acentoActual, suscribirAcento } from '../lib/acento'

const CONSULTA = '(prefers-color-scheme: light)'
const hayMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'

function suscribir(avisar: () => void) {
  if (!hayMedia()) return () => {}
  const m = window.matchMedia(CONSULTA)
  m.addEventListener('change', avisar)
  return () => m.removeEventListener('change', avisar)
}
const esClaro = () => hayMedia() && window.matchMedia(CONSULTA).matches

/** ¿El sistema está en tema claro? Se actualiza sola si el usuario lo cambia. */
export function useEsClaro(): boolean {
  return useSyncExternalStore(suscribir, esClaro, () => false)
}

/**
 * La paleta del tema ACTIVO como colores reales, con el acento que eligió el
 * usuario. Solo para lo que no puede usar las clases de Tailwind (que ya
 * siguen al tema y al acento solas vía variables CSS): las props de Recharts
 * (`fill`, `stroke`, `tick`) y algún `style` calculado.
 */
export function useColores(): PaletaColores {
  const claro = useEsClaro()
  const acento = useSyncExternalStore(suscribirAcento, acentoActual, () => 'morado')
  return useMemo(() => {
    const base = claro ? temas.claro.colores : temas.oscuro.colores
    const a = acentos.find(x => x.id === acento)
    return a ? { ...base, ...(claro ? a.claro : a.oscuro) } : base
  }, [claro, acento])
}
