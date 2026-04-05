import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  usdToGTQ,
  calcRendimientoAnualizado,
  calcResumenPortafolio,
  computeEvolucionPortafolio,
  calcFechasCiclo,
  calcAlertasTC,
  type Inversion,
  type InversionHistorial,
  type TarjetaCredito,
} from './finanzas'

const HOY = '2026-04-04'
const HACE_UN_ANIO = '2025-04-04'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-04-04T12:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

// ── usdToGTQ ────────────────────────────────────────────
describe('usdToGTQ', () => {
  it('convierte $100 a Q775 con tipo de cambio Q7.75', () => {
    expect(usdToGTQ(10_000, 775)).toBe(77_500)
  })
  it('convierte $1.00 a Q7.75', () => {
    expect(usdToGTQ(100, 775)).toBe(775)
  })
  it('redondea correctamente para fracciones de centavo', () => {
    expect(usdToGTQ(1, 775)).toBe(8)
  })
  it('retorna 0 para monto 0', () => {
    expect(usdToGTQ(0, 775)).toBe(0)
  })
  it('lanza error si tipoCambioUSD es 0', () => {
    expect(() => usdToGTQ(10_000, 0)).toThrow('tipoCambioUSD debe ser > 0')
  })
})

// ── calcRendimientoAnualizado ───────────────────────────
describe('calcRendimientoAnualizado', () => {
  it('retorna ~0% cuando valor = monto en el día de inicio', () => {
    const result = calcRendimientoAnualizado(10_000, 10_000, HOY)
    expect(result).toBeCloseTo(0, 0)
  })
  it('calcula ~8.5% anualizado (Q100 → Q108.50 en exactamente 1 año)', () => {
    const result = calcRendimientoAnualizado(10_000, 10_850, HACE_UN_ANIO)
    expect(result).toBeCloseTo(8.5, 0)
  })
  it('retorna valor negativo para pérdida', () => {
    const result = calcRendimientoAnualizado(10_000, 9_000, HACE_UN_ANIO)
    expect(result).toBeLessThan(0)
  })
  it('lanza error si monto_invertido es 0', () => {
    expect(() => calcRendimientoAnualizado(0, 10_000, HOY)).toThrow('monto_invertido debe ser > 0')
  })
  it('retorna -100 si valor_actual es 0 (pérdida total)', () => {
    expect(calcRendimientoAnualizado(10_000, 0, HACE_UN_ANIO)).toBe(-100)
  })
})

// ── calcResumenPortafolio ────────────────────────────────
describe('calcResumenPortafolio', () => {
  const GTQ_INV: Inversion = {
    id: '1', nombre: 'Fondo A', tipo: 'fondo',
    monto_invertido: 100_000, valor_actual: 110_000,
    moneda: 'GTQ', fecha_inicio: HACE_UN_ANIO, activa: true,
  }
  const USD_INV: Inversion = {
    id: '2', nombre: 'ETF B', tipo: 'acciones',
    monto_invertido: 10_000, valor_actual: 11_000,
    moneda: 'USD', fecha_inicio: HACE_UN_ANIO, activa: true,
  }

  it('retorna ceros para lista vacía', () => {
    const r = calcResumenPortafolio([])
    expect(r.capital_total).toBe(0)
    expect(r.valor_total).toBe(0)
    expect(r.rendimiento_anualizado).toBe(0)
  })
  it('suma capital y valor correctamente en GTQ puro', () => {
    const r = calcResumenPortafolio([GTQ_INV])
    expect(r.capital_total).toBe(100_000)
    expect(r.valor_total).toBe(110_000)
    expect(r.ganancia_total).toBe(10_000)
  })
  it('convierte USD a GTQ antes de sumar (tipo Q7.75)', () => {
    const r = calcResumenPortafolio([GTQ_INV, USD_INV], 775)
    expect(r.capital_total).toBe(100_000 + usdToGTQ(10_000, 775))
    expect(r.valor_total).toBe(110_000 + usdToGTQ(11_000, 775))
  })
  it('calcula ganancia_pct correctamente', () => {
    const r = calcResumenPortafolio([GTQ_INV])
    expect(r.ganancia_pct).toBeCloseTo(10.0, 1)
  })
  it('ignora inversiones inactivas', () => {
    const inactiva: Inversion = { ...GTQ_INV, id: '3', activa: false, valor_actual: 999_999 }
    const r = calcResumenPortafolio([GTQ_INV, inactiva])
    expect(r.valor_total).toBe(110_000)
  })
})

// ── computeEvolucionPortafolio ──────────────────────────
describe('computeEvolucionPortafolio', () => {
  const inv: Inversion = {
    id: '1', nombre: 'A', tipo: 'fondo',
    monto_invertido: 100_000, valor_actual: 115_000,
    moneda: 'GTQ', fecha_inicio: '2026-01-01', activa: true,
  }
  const hist: InversionHistorial[] = [
    { id: 'h1', inversion_id: '1', valor: 105_000, fecha: '2026-02-01' },
    { id: 'h2', inversion_id: '1', valor: 110_000, fecha: '2026-03-01' },
    { id: 'h3', inversion_id: '1', valor: 115_000, fecha: '2026-04-01' },
  ]

  it('retorna array vacío si no hay historial', () => {
    expect(computeEvolucionPortafolio([inv], [])).toHaveLength(0)
  })
  it('retorna un punto por fecha única', () => {
    expect(computeEvolucionPortafolio([inv], hist)).toHaveLength(3)
  })
  it('usa el valor del historial en cada fecha', () => {
    const result = computeEvolucionPortafolio([inv], hist)
    expect(result[0]).toEqual({ fecha: '2026-02-01', valor_total: 105_000 })
    expect(result[2]).toEqual({ fecha: '2026-04-01', valor_total: 115_000 })
  })
  it('usa monto_invertido para inversión sin historial previo a la fecha', () => {
    const inv2: Inversion = { ...inv, id: '2', monto_invertido: 50_000, valor_actual: 55_000 }
    const result = computeEvolucionPortafolio([inv, inv2], hist)
    expect(result[0].valor_total).toBe(105_000 + 50_000)
  })
  it('convierte inversiones USD a GTQ en el valor total', () => {
    const usdInv: Inversion = {
      id: '2', nombre: 'B', tipo: 'acciones',
      monto_invertido: 10_000, valor_actual: 11_000,
      moneda: 'USD', fecha_inicio: '2026-01-01', activa: true,
    }
    const usdHist: InversionHistorial[] = [
      { id: 'u1', inversion_id: '2', valor: 10_000, fecha: '2026-02-01' },
    ]
    // tipoCambioUSD = 775 → $100 = Q775 → usdToGTQ(10_000, 775) = 77_500
    const result = computeEvolucionPortafolio([inv, usdInv], [...hist, ...usdHist], 775)
    const feb = result.find(r => r.fecha === '2026-02-01')
    expect(feb?.valor_total).toBe(105_000 + usdToGTQ(10_000, 775))  // GTQ inv + USD inv converted
  })
})

// ── calcFechasCiclo ─────────────────────────────────────────
describe('calcFechasCiclo', () => {
  it('cierre este mes cuando hoy es antes del dia_cierre', () => {
    // Hoy 10 de abril, cierre día 20 → cierre este mes (abril)
    const hoy = new Date(2026, 3, 10)   // 10 abril 2026
    const r = calcFechasCiclo(20, 5, hoy)
    expect(r.fecha_cierre).toBe('2026-04-20')
    expect(r.fecha_inicio).toBe('2026-03-21')  // dia 21 de marzo (20+1)
    expect(r.fecha_pago).toBe('2026-05-05')    // diaPago(5) <= diaCierre(20) → mes siguiente
  })

  it('cierre mes siguiente cuando hoy es >= dia_cierre', () => {
    // Hoy 20 de abril (= dia_cierre), cierre → mayo
    const hoy = new Date(2026, 3, 20)
    const r = calcFechasCiclo(20, 5, hoy)
    expect(r.fecha_cierre).toBe('2026-05-20')
    expect(r.fecha_inicio).toBe('2026-04-21')
    expect(r.fecha_pago).toBe('2026-06-05')
  })

  it('pago en el mismo mes del cierre cuando diaPago > diaCierre', () => {
    // cierre día 15, pago día 25 → pago mismo mes que cierre
    const hoy = new Date(2026, 3, 10)
    const r = calcFechasCiclo(15, 25, hoy)
    expect(r.fecha_cierre).toBe('2026-04-15')
    expect(r.fecha_pago).toBe('2026-04-25')
  })

  it('maneja cruce de año correctamente', () => {
    // Hoy 20 de diciembre, cierre día 15 → cierre enero del año siguiente
    const hoy = new Date(2026, 11, 20)
    const r = calcFechasCiclo(15, 5, hoy)
    expect(r.fecha_cierre).toBe('2027-01-15')
    expect(r.fecha_inicio).toBe('2026-12-16')
    expect(r.fecha_pago).toBe('2027-02-05')
  })
})

// ── calcAlertasTC ───────────────────────────────────────────
describe('calcAlertasTC', () => {
  // Solo campos requeridos por la interface TarjetaCredito
  const TC_BASE: TarjetaCredito = {
    id: '1', nombre: 'Visa BAC',
    limite_credito: 1_000_000,
    deuda_actual: 0, deuda_ciclo_anterior: 0,
    dia_cierre: 20, dia_pago: 5,
    color: '', activa: true,
  }

  it('retorna lista vacía si no hay alertas', () => {
    // Hoy 10 abril, cierre 20 → 10 días, sin deuda anterior
    const hoy = new Date(2026, 3, 10)
    expect(calcAlertasTC([TC_BASE], hoy)).toHaveLength(0)
  })

  it('detecta cierre próximo cuando faltan ≤3 días', () => {
    // Hoy 17 de abril, cierre 20 → 3 días
    const hoy = new Date(2026, 3, 17)
    const alertas = calcAlertasTC([TC_BASE], hoy)
    expect(alertas).toHaveLength(1)
    expect(alertas[0].tipo).toBe('cierre_proximo')
    expect(alertas[0].diasRestantes).toBe(3)
  })

  it('detecta pago vencido cuando hay deuda_ciclo_anterior y pasó el dia_pago', () => {
    // Hoy 10 de mayo, dia_pago=5, deuda anterior > 0 → vencido
    const tc = { ...TC_BASE, deuda_ciclo_anterior: 300_000 }
    const hoy = new Date(2026, 4, 10)   // 10 mayo
    const alertas = calcAlertasTC([tc], hoy)
    expect(alertas).toHaveLength(1)
    expect(alertas[0].tipo).toBe('pago_vencido')
    expect(alertas[0].monto).toBe(300_000)
  })

  it('NO detecta pago vencido si aún no llegó el dia_pago', () => {
    // Hoy 3 de mayo, dia_pago=5 → todavía hay tiempo
    const tc = { ...TC_BASE, deuda_ciclo_anterior: 300_000 }
    const hoy = new Date(2026, 4, 3)
    expect(calcAlertasTC([tc], hoy)).toHaveLength(0)
  })

  it('pago_vencido va antes que cierre_proximo en el array', () => {
    const tc = { ...TC_BASE, deuda_ciclo_anterior: 100_000, dia_cierre: 21, dia_pago: 5 }
    // Hoy 18 mayo: cierre 21 → 3 días; dia_pago 5 → pasó
    const hoy = new Date(2026, 4, 18)
    const alertas = calcAlertasTC([tc], hoy)
    expect(alertas[0].tipo).toBe('pago_vencido')
  })
})
