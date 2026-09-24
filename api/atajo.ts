/**
 * El atajo de Apple Pay: la automatización "Transacción" del iPhone hace un
 * POST acá en cada pago. La lógica está en `_lib/atajo.ts`; ver docs/APPLE_PAY.md.
 */
import { manejarAtajo, type RespuestaPago } from './_lib/atajo.js'
import { clienteAnonimo } from './_lib/supabase.js'

const manejar = (request: Request) => manejarAtajo(request, {
  async registrar(claveHash, centavos, comercio, tarjeta) {
    const { data, error } = await clienteAnonimo().rpc('registrar_pago_atajo', {
      p_clave_hash: claveHash, p_centavos: centavos, p_comercio: comercio, p_tarjeta: tarjeta,
    })
    if (error) throw new Error(error.message)
    return data as RespuestaPago
  },
})

export { manejar as GET, manejar as POST }
