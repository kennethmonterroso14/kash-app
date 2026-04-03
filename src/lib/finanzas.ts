// ─── FORMATEO ────────────────────────────────────────────────

/**
 * Convierte centavos a string formateado en quetzales
 * Ejemplo: formatQ(123456) → "Q1,234.56"
 */
export function formatQ(centavos: number): string {
  if (!Number.isInteger(centavos)) {
    throw new Error(`formatQ espera un entero (centavos). Recibió: ${centavos}`)
  }
  const quetzales = centavos / 100
  return `Q${quetzales.toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * Convierte input del usuario a centavos (entero)
 * Ejemplo: toCentavos(1234.56) → 123456
 */
export function toCentavos(quetzales: number): number {
  if (isNaN(quetzales) || quetzales < 0) {
    throw new Error(`Valor inválido: ${quetzales}`)
  }
  return Math.round(quetzales * 100)
}

// ─── TIPOS ───────────────────────────────────────────────────

export interface Transaccion {
  id: string
  fecha: string
  cantidad: number        // centavos, negativo = gasto
  categoria: string
  tipo: 'ingreso' | 'gasto' | 'ajuste'
  descripcion: string
}

export interface EstadisticasMes {
  ingresos: number        // centavos
  gastos: number          // centavos (valor absoluto)
  neto: number            // centavos
  pctAhorro: number       // 0-100
  porCategoria: Record<string, number>  // centavos por categoría
}

export interface PuntoProyeccion {
  mes: number
  fecha: Date
  patrimonio: number      // centavos
}

export type EstadoPresupuesto = 'ok' | 'alerta' | 'excedido'

// ─── ANÁLISIS MENSUAL ─────────────────────────────────────────

export function calcEstadisticasMes(
  transacciones: Transaccion[]
): EstadisticasMes {
  const ingresos = transacciones
    .filter(t => t.tipo === 'ingreso')
    .reduce((sum, t) => sum + t.cantidad, 0)

  const gastos = transacciones
    .filter(t => t.tipo === 'gasto')
    .reduce((sum, t) => sum + Math.abs(t.cantidad), 0)

  const neto = ingresos - gastos
  const pctAhorro = ingresos > 0
    ? Math.round((neto / ingresos) * 100)
    : 0

  const porCategoria: Record<string, number> = {}
  transacciones
    .filter(t => t.tipo === 'gasto')
    .forEach(t => {
      porCategoria[t.categoria] =
        (porCategoria[t.categoria] || 0) + Math.abs(t.cantidad)
    })

  return { ingresos, gastos, neto, pctAhorro, porCategoria }
}

// ─── PROYECCIONES ─────────────────────────────────────────────

/**
 * Proyecta crecimiento de patrimonio con interés compuesto mensual
 */
export function proyectarPatrimonio(params: {
  patrimonioActual: number    // centavos
  ahorroMensual: number       // centavos
  rendimientoAnual: number    // decimal, ej: 0.07 = 7%
  meses: number
}): PuntoProyeccion[] {
  const { patrimonioActual, ahorroMensual, rendimientoAnual, meses } = params

  if (meses < 1 || meses > 600)
    throw new Error('Meses debe estar entre 1 y 600')
  if (rendimientoAnual < 0 || rendimientoAnual > 1)
    throw new Error('Rendimiento debe estar entre 0 y 1')

  const tasaMensual = rendimientoAnual / 12
  const puntos: PuntoProyeccion[] = []
  let patrimonio = patrimonioActual
  const ahora = new Date()

  for (let mes = 1; mes <= meses; mes++) {
    patrimonio = Math.round(patrimonio * (1 + tasaMensual) + ahorroMensual)
    const fecha = new Date(ahora.getFullYear(), ahora.getMonth() + mes, 1)
    puntos.push({ mes, fecha, patrimonio })
  }

  return puntos
}

/**
 * Calcula cuánto tiempo para alcanzar una meta de ahorro
 */
export function calcTiempoParaMeta(
  meta: number,
  ahorroMensual: number,
  patrimonioActual: number = 0
): { meses: number; fecha: Date } {
  if (ahorroMensual <= 0)
    throw new Error('El ahorro mensual debe ser mayor a 0')
  if (meta <= patrimonioActual)
    return { meses: 0, fecha: new Date() }

  const meses = Math.ceil((meta - patrimonioActual) / ahorroMensual)
  const fecha = new Date()
  fecha.setMonth(fecha.getMonth() + meses)

  return { meses, fecha }
}

// ─── DEUDA ────────────────────────────────────────────────────

/**
 * Calcula proyección de pago de deuda
 */
export function calcPagoDeuda(params: {
  saldoActual: number     // centavos
  cuotaMensual: number    // centavos
  pagoExtra?: number      // centavos adicionales por mes
}): { mesesRestantes: number; fechaTermino: Date } {
  const { saldoActual, cuotaMensual, pagoExtra = 0 } = params
  const pagoTotal = cuotaMensual + pagoExtra

  if (pagoTotal <= 0) throw new Error('La cuota debe ser mayor a 0')
  if (saldoActual <= 0) return { mesesRestantes: 0, fechaTermino: new Date() }

  const meses = Math.ceil(saldoActual / pagoTotal)
  const fecha = new Date()
  fecha.setMonth(fecha.getMonth() + meses)

  return { mesesRestantes: meses, fechaTermino: fecha }
}

// ─── PRESUPUESTO ──────────────────────────────────────────────

export function calcEstadoPresupuesto(
  gastado: number,
  limite: number
): { pct: number; estado: EstadoPresupuesto; restante: number } {
  if (limite <= 0) throw new Error('El límite debe ser mayor a 0')

  const pct = Math.round((gastado / limite) * 100)
  const restante = limite - gastado
  const estado: EstadoPresupuesto =
    pct >= 100 ? 'excedido' : pct >= 75 ? 'alerta' : 'ok'

  return { pct, estado, restante }
}
