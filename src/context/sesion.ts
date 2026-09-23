import { createContext, useContext } from 'react'
import type { Cuenta, useCuentas } from '../hooks/useCuentas'
import type { CategoriaUsuario, useCategorias } from '../hooks/useCategorias'
import type { useTarjetas } from '../hooks/useTarjetas'
import type { TarjetaCredito, ResumenTC } from '../lib/finanzas'

/**
 * Datos que se cargan UNA vez por sesión y que casi todas las páginas
 * necesitan. Antes cada página montaba sus propios hooks: useCuentas y
 * useCategorias los instanciaban 6 páginas cada uno, useTarjetas 4, y `profiles`
 * se consultaba desde 6 lugares. Abrir el Dashboard disparaba seis fetch.
 *
 * Lo que NO vive acá, a propósito:
 *   - `transacciones` y `presupuestos` están acotados por mes
 *   - `inversiones` e `historial` solo los usan 2 páginas y son pesados
 *   - `ciclos_tc` es por tarjeta
 * Esos siguen siendo hooks por página.
 */

export interface Perfil {
  nombre: string | null
  moneda: string
  locale: string
  zona_horaria: string
  tipo_cambio_usd: number
  tipo_cambio_actualizado_at: string | null
  /** El color de acento (ver `acentos` en tokens.js). Null en una base sin la columna. */
  acento: string | null
}

// Defaults de Guatemala: es de donde viene la app y son los valores que la base
// ya tiene. Un perfil sin `locale`/`zona_horaria` (columnas de la tarea 1.3.4)
// cae acá y sigue funcionando igual que antes.
export const PERFIL_DEFAULT: Perfil = {
  nombre: null,
  moneda: 'GTQ',
  locale: 'es-GT',
  zona_horaria: 'America/Guatemala',
  tipo_cambio_usd: 775,
  tipo_cambio_actualizado_at: null,
  acento: null,
}

export interface Sesion {
  userId: string
  /** Del usuario de auth, no de `profiles`: ahí no se guarda. */
  email: string | null
  perfil: Perfil
  cuentas: Cuenta[]
  totalPatrimonio: number
  categoriasGasto: string[]
  categoriasIngreso: string[]
  coloresCategorias: Record<string, string>
  categoriasPropias: CategoriaUsuario[]
  tarjetas: TarjetaCredito[]
  resumenTCs: { tc: TarjetaCredito; resumen: ResumenTC }[]
  totalDeuda: number
  /** Cargando por slice. Un slice lento no bloquea a los otros. */
  cargando: { perfil: boolean; cuentas: boolean; categorias: boolean; tarjetas: boolean }
  /** Error por slice: que falle tarjetas no debe ocultar las cuentas. */
  error: { perfil: string | null; cuentas: string | null; categorias: string | null; tarjetas: string | null }
  /** Invalidación EXPLÍCITA después de un write. No hay refetch automático. */
  refrescar: {
    perfil: () => Promise<void>
    cuentas: () => Promise<void>
    categorias: () => Promise<void>
    tarjetas: () => Promise<void>
    todo: () => Promise<void>
  }
  /**
   * Generación de `transacciones`. Los hooks acotados por mes (`useTransacciones`,
   * `useResumen6Meses`) NO viven en el provider, así que una escritura hecha
   * desde OTRA instancia —el `+` global, o registrarCargo/registrarPago del
   * provider— no los tocaría. La ponen en las deps de su fetch y así se vuelven
   * a consultar cuando cualquier escritura la incrementa. Es el mismo bug del
   * saldo del dashboard, pero para la lista y el resumen de 6 meses.
   */
  generacionTxns: number
  /** La incrementa quien escribe en `transacciones`. Estable. */
  invalidarTxns: () => void
  /** Writers que invalidan su propio slice. */
  actualizarCuenta: ReturnType<typeof useCuentas>['actualizarCuenta']
  eliminarCuenta: ReturnType<typeof useCuentas>['eliminarCuenta']
  agregarCategoria: ReturnType<typeof useCategorias>['agregarCategoria']
  eliminarCategoria: ReturnType<typeof useCategorias>['eliminarCategoria']
  agregarTC: ReturnType<typeof useTarjetas>['agregarTC']
  actualizarTC: ReturnType<typeof useTarjetas>['actualizarTC']
  archivarTC: ReturnType<typeof useTarjetas>['archivarTC']
  cerrarCiclo: ReturnType<typeof useTarjetas>['cerrarCiclo']
  registrarCargo: ReturnType<typeof useTarjetas>['registrarCargo']
  registrarPago: ReturnType<typeof useTarjetas>['registrarPago']
}

export const SesionCtx = createContext<Sesion | null>(null)

/**
 * Lanza si se usa fuera del provider, que solo puede pasar por un error de
 * montaje: el provider envuelve todo lo que hay detrás del gate de auth.
 */
export function useSesion(): Sesion {
  const ctx = useContext(SesionCtx)
  if (!ctx) throw new Error('useSesion() requiere estar dentro de <SesionProvider>')
  return ctx
}
