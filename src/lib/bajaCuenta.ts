/**
 * Qué hacer cuando el usuario pide eliminar una cuenta.
 *
 * La base manda en dos cosas y este es el único lugar que las traduce:
 *
 * - `transacciones.cuenta_id` y `pagos_recurrentes.cuenta_id` son `on delete
 *   restrict`: una cuenta con movimientos o con pagos fijos NO se puede borrar.
 *   Esas se **archivan** (`activa = false`): desaparecen de la app y su
 *   historial sigue intacto, igual que `useTarjetas.archivarTC`.
 * - `totalPatrimonio` suma las cuentas ACTIVAS. Archivar una con saldo haría
 *   caer el patrimonio en ese monto sin que ninguna transacción lo explique, así
 *   que con saldo distinto de cero se **bloquea**: primero se transfiere o se
 *   ajusta a cero.
 *
 * Un pago fijo ACTIVO también bloquea: `useAutoApplyPagos` lo seguiría
 * aplicando cada mes sobre una cuenta que ya no se ve, moviendo un saldo
 * invisible.
 */
export type DecisionBaja =
  | { accion: 'borrar' }
  | { accion: 'archivar' }
  | { accion: 'bloquear'; motivo: 'saldo' | 'pagos_fijos' }

export function decidirBajaCuenta({ saldo, movimientos, pagosFijos, pagosFijosActivos }: {
  /** Centavos, leído de la base en el momento de borrar. */
  saldo: number
  movimientos: number
  /** Todos los pagos fijos que apuntan a la cuenta, activos o no. */
  pagosFijos: number
  pagosFijosActivos: number
}): DecisionBaja {
  if (saldo !== 0) return { accion: 'bloquear', motivo: 'saldo' }
  if (pagosFijosActivos > 0) return { accion: 'bloquear', motivo: 'pagos_fijos' }
  if (movimientos > 0 || pagosFijos > 0) return { accion: 'archivar' }
  return { accion: 'borrar' }
}
