import { useAutoApplyPagos } from '../hooks/useAutoApplyPagos'

/**
 * No renderiza nada: existe solo para que `useAutoApplyPagos` corra DENTRO del
 * SesionProvider y pueda leer la zona horaria del perfil.
 *
 * Antes se llamaba desde `App.tsx`, fuera del provider, así que el mes actual
 * se decidía con Guatemala cableado — y de ese mes depende qué vencimiento
 * cuenta como vencido. Al moverlo acá también corre después del gate de
 * onboarding, lo cual es más correcto: un usuario sin fila en `profiles`
 * tampoco tiene pagos fijos.
 */
export default function AutoAplicarPagos({ userId }: { userId: string }) {
  useAutoApplyPagos(userId)
  return null
}
