import { supabase } from './supabase'

interface Alta {
  userId: string
  nombre: string
  tipo: string
  color: string
  /** Centavos. 0 = la cuenta arranca vacía y no se inserta ningún ajuste. */
  saldoCentavos: number
  /** 'YYYY-MM-DD' en la zona del usuario. */
  hoy: string
}

/**
 * Crea una cuenta con su saldo de apertura.
 *
 * **La cuenta se inserta en 0 y el saldo lo pone el trigger** a partir de una
 * transacción de tipo `ajuste`. `cuentas.saldo` nunca se escribe desde el
 * cliente (ver CLAUDE.md): lo mantiene `trigger_saldo_transaccion`, y escribirlo
 * a mano lo dejaría peleando con los deltas del trigger.
 *
 * Si el ajuste falla, **se borra la cuenta**. Sin esa compensación queda una
 * cuenta huérfana en Q0.00 y un reintento la duplica. Se puede borrar sin
 * problema porque todavía no hay ninguna transacción que la referencie, así que
 * el `on delete restrict` de `transacciones.cuenta_id` no se dispara.
 *
 * Vive acá y no en un componente porque la usan dos lugares que no pueden
 * compartir un componente: `ModalNuevaCuenta`, que corre dentro del
 * `SesionProvider`, y `SetupPage`, que corre ANTES de que el provider exista.
 * Duplicar la compensación en los dos era pedir que se separaran.
 *
 * Devuelve el mensaje de error listo para mostrar, o null si salió bien. No
 * lanza: el llamador lo pinta en un `Aviso`.
 */
export async function crearCuentaConSaldo(
  { userId, nombre, tipo, color, saldoCentavos, hoy }: Alta,
): Promise<string | null> {
  const { data: cuenta, error: errCuenta } = await supabase
    .from('cuentas')
    .insert({ user_id: userId, nombre: nombre.trim(), tipo, saldo: 0, color })
    .select('id, nombre')
    .single()
  if (errCuenta) return errCuenta.message
  if (!cuenta) return 'La cuenta no se pudo crear'

  if (saldoCentavos <= 0) return null

  const { error: errTxn } = await supabase.from('transacciones').insert({
    user_id: userId,
    cuenta_id: cuenta.id,
    fecha: hoy,
    cantidad: saldoCentavos,
    descripcion: `Saldo inicial ${cuenta.nombre}`.slice(0, 200),
    categoria: 'Ajuste de cuenta',
    tipo: 'ajuste',
  })
  if (!errTxn) return null

  const { error: errRollback } = await supabase
    .from('cuentas').delete().eq('id', cuenta.id).eq('user_id', userId)

  // Si la compensación TAMBIÉN falla se dice explícitamente qué quedó a medias:
  // el usuario tiene una cuenta en Q0.00 y hay que decirle qué hacer, no
  // dejarlo con un error genérico sobre una transacción.
  return errRollback
    ? `${errTxn.message} — la cuenta "${cuenta.nombre}" quedó creada con saldo Q0.00; ajustá su saldo manualmente.`
    : errTxn.message
}
