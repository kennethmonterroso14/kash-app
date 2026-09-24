/**
 * Validación de lo que manda una IA por el conector MCP. Todo puro: sin red y
 * sin base, para que se pueda probar entero.
 *
 * Los mensajes van en español y dicen qué corregir, porque quien los lee es el
 * modelo que va a reintentar — y a veces se los muestra tal cual a la persona.
 */
import { toCentavos } from '../../src/lib/finanzas.js'

/** Un error que la IA puede corregir: se devuelve como resultado con `isError`. */
export class ErrorHerramienta extends Error {}

/** Tope por monto: diez mil millones en unidades. Un número así es un error de lectura. */
const MONTO_MAXIMO = 10_000_000_000

/**
 * Un monto en unidades de la moneda (125.50) → centavos, POSITIVO.
 * Acepta número o texto con punto decimal; el signo lo pone quien llama según
 * el tipo, igual que en la app.
 */
export function leerMonto(valor: unknown, campo = 'monto'): number {
  const n = typeof valor === 'string' ? Number(valor.trim()) : valor
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new ErrorHerramienta(`${campo}: debe ser un número en unidades de la moneda, por ejemplo 125.50`)
  }
  if (n <= 0) throw new ErrorHerramienta(`${campo}: debe ser mayor que 0 (el signo lo pone el tipo)`)
  if (n > MONTO_MAXIMO) throw new ErrorHerramienta(`${campo}: ${n} es demasiado grande`)
  const centavos = toCentavos(n)
  if (centavos === 0) throw new ErrorHerramienta(`${campo}: redondeado a centavos queda en 0`)
  return centavos
}

/** Un saldo (puede ser 0 o negativo, p. ej. un sobregiro) → centavos con signo. */
export function leerSaldo(valor: unknown, campo = 'saldo'): number {
  const n = typeof valor === 'string' ? Number(valor.trim()) : valor
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new ErrorHerramienta(`${campo}: debe ser un número en unidades de la moneda, por ejemplo 1250.50`)
  }
  if (Math.abs(n) > MONTO_MAXIMO) throw new ErrorHerramienta(`${campo}: ${n} es demasiado grande`)
  // `toCentavos` no acepta negativos a propósito: el signo se aplica afuera.
  return toCentavos(Math.abs(n)) * (n < 0 ? -1 : 1)
}

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * 'YYYY-MM-DD' real (no 2026-02-30), no futura respecto de `hoy` — que es hoy
 * EN LA ZONA DE LA PERSONA — y no absurda. Sin fecha, `hoy`.
 */
export function leerFecha(valor: unknown, hoy: string, campo = 'fecha'): string {
  if (valor === undefined || valor === null || valor === '') return hoy
  const m = typeof valor === 'string' ? RE_FECHA.exec(valor.trim()) : null
  if (!m) throw new ErrorHerramienta(`${campo}: usa el formato YYYY-MM-DD, por ejemplo ${hoy}`)
  const [, a, me, d] = m.map(Number)
  const dt = new Date(Date.UTC(a, me - 1, d))
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== me - 1 || dt.getUTCDate() !== d) {
    throw new ErrorHerramienta(`${campo}: ${valor} no es una fecha que exista`)
  }
  const fecha = m[0]
  if (fecha > hoy) throw new ErrorHerramienta(`${campo}: ${fecha} es futura (hoy es ${hoy})`)
  if (fecha < '2000-01-01') throw new ErrorHerramienta(`${campo}: ${fecha} es demasiado antigua`)
  return fecha
}

/** 'YYYY-MM'. Sin mes, el actual. */
export function leerMes(valor: unknown, mesActual: string): string {
  if (valor === undefined || valor === null || valor === '') return mesActual
  if (typeof valor !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(valor.trim())) {
    throw new ErrorHerramienta(`mes: usa el formato YYYY-MM, por ejemplo ${mesActual}`)
  }
  return valor.trim()
}

/** Primer y último día de un mes 'YYYY-MM', como las consultas de la app. */
export function rangoMes(mes: string): { desde: string; hasta: string } {
  const [a, m] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` }
}

/** Texto obligatorio, recortado y con largo máximo (el de la columna). */
export function leerTexto(valor: unknown, campo: string, maximo: number): string {
  if (typeof valor !== 'string' || !valor.trim()) throw new ErrorHerramienta(`${campo}: es obligatorio`)
  const t = valor.trim()
  if (t.length > maximo) throw new ErrorHerramienta(`${campo}: máximo ${maximo} caracteres`)
  return t
}

export function leerTextoOpcional(valor: unknown, campo: string, maximo: number): string | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined
  return leerTexto(valor, campo, maximo)
}

// ─── DUPLICADOS ───────────────────────────────────────────────────────

export interface MovimientoComparable {
  cuenta_id: string | null
  fecha: string
  cantidad: number
  descripcion: string
}

/**
 * Misma cuenta, fecha, monto (con signo) y descripción — esta última sin
 * mayúsculas ni espacios de más, que es en lo que dos lecturas del mismo
 * estado de cuenta suelen diferir.
 */
export const claveMovimiento = (t: MovimientoComparable): string =>
  [t.cuenta_id ?? '', t.fecha, t.cantidad, t.descripcion.trim().toLowerCase().replace(/\s+/g, ' ')].join('|')

/**
 * Parte los movimientos nuevos en los que hay que insertar y los que ya están.
 *
 * Se compara como MULTICONJUNTO: cada fila existente "consume" a lo sumo una
 * nueva. Así, reimportar el mismo estado no duplica nada, pero si el estado
 * trae tres cafés iguales el mismo día y ya había dos registrados, entra uno —
 * los tres eran reales.
 */
export function separarDuplicados<T extends MovimientoComparable>(
  nuevos: T[],
  existentes: MovimientoComparable[],
): { insertar: T[]; duplicados: T[] } {
  const disponibles = new Map<string, number>()
  for (const e of existentes) {
    const k = claveMovimiento(e)
    disponibles.set(k, (disponibles.get(k) ?? 0) + 1)
  }
  const insertar: T[] = []
  const duplicados: T[] = []
  for (const n of nuevos) {
    const k = claveMovimiento(n)
    const quedan = disponibles.get(k) ?? 0
    if (quedan > 0) {
      disponibles.set(k, quedan - 1)
      duplicados.push(n)
    } else {
      insertar.push(n)
    }
  }
  return { insertar, duplicados }
}
