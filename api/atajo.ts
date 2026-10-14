/**
 * El atajo de Apple Pay: la automatización "Transacción" del iPhone hace un
 * POST acá en cada pago. La lógica está en `_lib/atajo.ts`; ver docs/APPLE_PAY.md.
 */
import { manejarAtajo, type RespuestaPago } from './_lib/atajo.js'
import { clienteAnonimo } from './_lib/supabase.js'

const manejar = (request: Request) => manejarAtajo(request, {
  async registrar(claveHash, centavos, comercio, tarjeta, moneda) {
    const db = clienteAnonimo()
    const args = { p_clave_hash: claveHash, p_centavos: centavos, p_comercio: comercio, p_tarjeta: tarjeta }
    let { data, error } = await db.rpc('registrar_pago_atajo', { ...args, p_moneda: moneda })
    // Sin la migración de cuentas en dólares la función no tiene `p_moneda` y
    // PostgREST no la encuentra (PGRST202): se registra sin convertir, como antes.
    if (error?.code === 'PGRST202') ({ data, error } = await db.rpc('registrar_pago_atajo', args))
    if (error) throw new Error(error.message)
    return data as RespuestaPago
  },
})

export { manejar as GET, manejar as POST }
