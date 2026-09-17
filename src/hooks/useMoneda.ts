import { useMemo } from 'react'
import { useSesion } from '../context/sesion'
import { formatMoneda } from '../lib/finanzas'

/**
 * Formatea centavos con la moneda y el locale del usuario.
 *
 *   const fmt = useMoneda()
 *   fmt(150000)          → "Q1,500.00" | "$1,500.00" | "L1,500.00"
 *   fmt(150000, 'USD')   → "$1,500.00"  (moneda explícita, locale del perfil)
 *
 * El segundo parámetro existe para los montos que están guardados en su propia
 * moneda y no en la del perfil: las filas USD de `inversiones`. Antes eso se
 * armaba a mano (`$${x / 100}.toFixed(2)`), que se saltaba el separador de
 * miles.
 *
 * `formatMoneda` se queda pura en `finanzas.ts`; la currificación con el perfil
 * es esto. Meter el contexto dentro del formateador rompería su pureza y sus
 * tests.
 *
 * Si el perfil no se pudo leer devuelve '—': el símbolo de moneda sería una
 * suposición, y presentar Q como un hecho cuando no se leyó la moneda del
 * usuario es la clase de bug que se corrigió en el resto de la app. Es el mismo
 * '—' que ya usa CuentasPage cuando falla su consulta.
 */
export function useMoneda(): (centavos: number, moneda?: string) => string {
  const { perfil, error } = useSesion()
  const perfilFallo = !!error.perfil

  return useMemo(() => {
    const locale = perfil.locale
    const propia = perfil.moneda
    return (centavos: number, moneda?: string) =>
      perfilFallo ? '—' : formatMoneda(centavos, { moneda: moneda ?? propia, locale })
  }, [perfil.locale, perfil.moneda, perfilFallo])
}
