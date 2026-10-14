import { useCallback, useMemo } from 'react'
import { useSesion } from '../context/sesion'
import { aMonedaBase, monedaISO, simboloMoneda, txnsEnMonedaBase, type MonedaCuenta } from '../lib/finanzas'

/**
 * Las monedas de las cuentas, curriadas con la sesión: de qué moneda es un
 * movimiento (por su cuenta) y cuánto vale en la moneda del perfil. Lo que
 * SUMA usa `enBase` / `txnsEnBase`; lo que MUESTRA un monto usa `monedaDe`.
 *
 * Un movimiento sin cuenta es de tarjeta, y las tarjetas son en quetzales.
 */
export function useMonedas() {
  const { monedasCuentas, perfil } = useSesion()
  const tipoCambioUSD = perfil.tipo_cambio_usd

  const monedaDe = useCallback(
    (cuentaId: string | null | undefined): MonedaCuenta => (cuentaId && monedasCuentas[cuentaId]) || 'GTQ',
    [monedasCuentas],
  )

  return useMemo(() => ({
    tipoCambioUSD,
    monedaDe,
    enBase: (centavos: number, moneda: string | null | undefined) => aMonedaBase(centavos, moneda, tipoCambioUSD),
    txnsEnBase: <T extends { cantidad: number; cuenta_id?: string | null }>(txns: T[]) =>
      txnsEnMonedaBase(txns, monedaDe, tipoCambioUSD),
    /** El símbolo para la etiqueta de un campo de monto en esa moneda ("Q", "US$"…). */
    simbolo: (moneda: MonedaCuenta) => simboloMoneda({ moneda: monedaISO(moneda, perfil.moneda), locale: perfil.locale }),
    /** El código ISO, para exportar: 'GTQ' es la moneda del perfil. */
    iso: (moneda: MonedaCuenta) => monedaISO(moneda, perfil.moneda),
    /** Para el texto: "dólares", "quetzales", o el código si el perfil es de otra moneda. */
    nombre: (moneda: MonedaCuenta) => {
      const iso = monedaISO(moneda, perfil.moneda)
      return iso === 'USD' ? 'dólares' : iso === 'GTQ' ? 'quetzales' : iso
    },
    /**
     * Si tiene sentido marcar una cuenta en dólares: no cuando la moneda del
     * perfil ya es el dólar (convertiría US$ a US$ con el tipo de cambio).
     */
    ofrecerDolares: perfil.moneda !== 'USD',
  }), [tipoCambioUSD, monedaDe, perfil.moneda, perfil.locale])
}
