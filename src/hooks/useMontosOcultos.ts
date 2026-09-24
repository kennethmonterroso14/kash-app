import { useSyncExternalStore } from 'react'
import { alternarMontos, montosOcultos, suscribirMontos } from '../lib/modoPrivado'

/**
 * El modo privado de los montos, compartido por Resumen y Cuentas: ocultar en
 * una pantalla oculta en las dos. Arranca oculto en cada apertura de la app
 * (ver lib/modoPrivado.ts).
 */
export function useMontosOcultos(): [oculto: boolean, alternar: () => void] {
  return [useSyncExternalStore(suscribirMontos, montosOcultos), alternarMontos]
}
