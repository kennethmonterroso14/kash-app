import { useCallback, useMemo } from 'react'
import { useSesion } from '../context/sesion'
import { aMonedaBase, txnsEnMonedaBase, type MonedaCuenta } from '../lib/finanzas'

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
  }), [tipoCambioUSD, monedaDe])
}
