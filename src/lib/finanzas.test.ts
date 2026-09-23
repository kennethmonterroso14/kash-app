import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  usdToGTQ,
  calcRendimientoAnualizado,
  calcResumenPortafolio,
  computeEvolucionPortafolio,
  calcFechasCiclo,
  calcAlertasTC,
  calcResumenTC,
  calcAnillosPresupuesto,
  calcProximoPagoTC,
  agruparPorDia,
  simboloMoneda,
  calcRebanadasCategorias,
  promedioCentavos,
  type ResumenTC,
  type Inversion,
  type InversionHistorial,
  formatMoneda,
  type TarjetaCredito,
} from './finanzas'

const HOY = '2026-04-04'
const HACE_UN_ANIO = '2025-04-04'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-04-04T12:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

// ── formatMoneda ────────────────────────────────────────
describe('formatMoneda', () => {
  const GTQ = { moneda: 'GTQ', locale: 'es-GT' }
  const USD = { moneda: 'USD', locale: 'en-US' }
  const HNL = { moneda: 'HNL', locale: 'es-HN' }

  it('formatea quetzales igual que antes: símbolo pegado al número', () => {
    expect(formatMoneda(0, GTQ)).toBe('Q0.00')
    expect(formatMoneda(1, GTQ)).toBe('Q0.01')
    expect(formatMoneda(123456, GTQ)).toBe('Q1,234.56')
    expect(formatMoneda(100000000, GTQ)).toBe('Q1,000,000.00')
  })

  it('pone el signo ANTES del símbolo, no entre el símbolo y el número', () => {
    // El formateador viejo emitía "Q-1,234.56" porque pegaba la "Q" a mano.
    expect(formatMoneda(-123456, GTQ)).toBe('-Q1,234.56')
    expect(formatMoneda(-1, GTQ)).toBe('-Q0.01')
  })

  it('cambia el símbolo con la moneda', () => {
    expect(formatMoneda(123456, USD)).toBe('$1,234.56')
    expect(formatMoneda(123456, HNL)).toBe('L1,234.56')
    expect(formatMoneda(-123456, HNL)).toBe('-L1,234.56')
  })

  it('usa el símbolo corto y no el código cuando el locale no es el de la moneda', () => {
    // Sin currencyDisplay: 'narrowSymbol', 'es-GT' + USD sale "USD 1,234.56".
    expect(formatMoneda(123456, { moneda: 'USD', locale: 'es-GT' })).toBe('$1,234.56')
  })

  it('respeta los separadores y la posición del símbolo del locale', () => {
    // El símbolo va DESPUÉS y el espacio de ese lado sí se conserva. Es el
    // espacio duro que emite ICU (U+00A0), no uno normal: escrito literal, este
    // test pasa o falla según el editor que guardó el archivo.
    expect(formatMoneda(123456, { moneda: 'EUR', locale: 'de-DE' })).toBe('1.234,56\u00A0€')
    expect(formatMoneda(123456, { moneda: 'COP', locale: 'es-CO' })).toBe('$1.234,56')
  })

  it('siempre emite dos decimales, aunque la moneda no los use por default', () => {
    // El default de ICU para COP es 0 decimales. Respetarlo redondearía el
    // monto guardado, y el modelo de datos guarda centésimos siempre.
    expect(formatMoneda(123456, { moneda: 'COP', locale: 'es-CO' })).toMatch(/,56$/)
    expect(formatMoneda(100, { moneda: 'COP', locale: 'es-CO' })).toBe('$1,00')
  })

  it('lanza con un no-entero: los centavos son enteros por definición', () => {
    expect(() => formatMoneda(1234.5, GTQ)).toThrow(/entero/)
    expect(() => formatMoneda(NaN, GTQ)).toThrow(/entero/)
  })

  it('con una moneda inválida muestra el código en lugar de tumbar el render', () => {
    // Esto corre en render: lanzar desmontaría el árbol por un dato de
    // configuración. Mostrar el código es honesto; inventar un símbolo no.
    expect(formatMoneda(123456, { moneda: 'NOEXISTE', locale: 'es-GT' })).toBe('NOEXISTE 1,234.56')
    expect(formatMoneda(-123456, { moneda: 'NOEXISTE', locale: 'es-GT' })).toBe('-NOEXISTE 1,234.56')
  })

  it('el caché de formateadores no mezcla monedas', () => {
    // Se memoizan por par locale+moneda; una clave mal armada daría el mismo
    // símbolo para todas después de la primera llamada.
    expect(formatMoneda(100, GTQ)).toBe('Q1.00')
    expect(formatMoneda(100, USD)).toBe('$1.00')
    expect(formatMoneda(100, GTQ)).toBe('Q1.00')
    expect(formatMoneda(100, { moneda: 'GTQ', locale: 'en-US' })).toBe('Q1.00')
  })
})

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
  it('aporta 0 en fechas anteriores a fecha_inicio (no rellena con monto_invertido)', () => {
    const tardia: Inversion = {
      ...inv, id: '2', monto_invertido: 50_000, valor_actual: 50_000,
      fecha_inicio: '2026-09-01',
    }
    const histTardia: InversionHistorial[] = [
      ...hist,
      { id: 'h4', inversion_id: '2', valor: 50_000, fecha: '2026-09-01' },
    ]
    const result = computeEvolucionPortafolio([inv, tardia], histTardia)
    expect(result).toHaveLength(4)
    // La inversión tardía todavía no existía en feb/mar/abr → no suma nada
    expect(result[0]).toEqual({ fecha: '2026-02-01', valor_total: 105_000 })
    expect(result[2]).toEqual({ fecha: '2026-04-01', valor_total: 115_000 })
    expect(result[3]).toEqual({ fecha: '2026-09-01', valor_total: 115_000 + 50_000 })
  })

  it('ignora las fechas que solo aporta una inversión archivada', () => {
    const archivada: Inversion = {
      ...inv, id: '2', activa: false, fecha_inicio: '2025-01-01',
    }
    const histArchivada: InversionHistorial[] = [
      { id: 'a1', inversion_id: '2', valor: 900_000, fecha: '2025-06-01' },
    ]
    const result = computeEvolucionPortafolio([inv, archivada], [...histArchivada, ...hist])
    expect(result.map(r => r.fecha)).toEqual(['2026-02-01', '2026-03-01', '2026-04-01'])
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

  // ── días 29-31: el día debe clamparse al último día real del mes ──
  it('clampa dia_cierre 31 a febrero no bisiesto', () => {
    const hoy = new Date(2026, 1, 5)   // 5 feb 2026 (no bisiesto)
    const r = calcFechasCiclo(31, 5, hoy)
    expect(r.fecha_cierre).toBe('2026-02-28')
    expect(r.fecha_inicio).toBe('2026-02-01')  // 31 ene + 1 día
    expect(r.fecha_pago).toBe('2026-03-05')
  })

  it('clampa dia_cierre 31 a febrero bisiesto', () => {
    const hoy = new Date(2028, 1, 5)   // 5 feb 2028 (bisiesto)
    const r = calcFechasCiclo(31, 5, hoy)
    expect(r.fecha_cierre).toBe('2028-02-29')
    expect(r.fecha_inicio).toBe('2028-02-01')
    expect(r.fecha_pago).toBe('2028-03-05')
  })

  it('clampa dia_cierre 30 en febrero', () => {
    const hoy = new Date(2026, 1, 5)
    const r = calcFechasCiclo(30, 15, hoy)
    expect(r.fecha_cierre).toBe('2026-02-28')
    expect(r.fecha_inicio).toBe('2026-01-31')  // 30 ene + 1 día
    expect(r.fecha_pago).toBe('2026-03-15')
  })

  it('clampa dia_cierre 29 en febrero no bisiesto', () => {
    const hoy = new Date(2026, 1, 3)
    const r = calcFechasCiclo(29, 10, hoy)
    expect(r.fecha_cierre).toBe('2026-02-28')
    expect(r.fecha_pago).toBe('2026-03-10')
  })

  it('clampa dia_cierre 31 en meses de 30 días', () => {
    const r = calcFechasCiclo(31, 5, new Date(2026, 3, 10))   // abril
    expect(r.fecha_cierre).toBe('2026-04-30')
    expect(r.fecha_inicio).toBe('2026-04-01')                 // 31 mar + 1 día
    const s = calcFechasCiclo(31, 15, new Date(2026, 8, 17))  // septiembre
    expect(s.fecha_cierre).toBe('2026-09-30')
    expect(s.fecha_inicio).toBe('2026-09-01')
  })

  it('clampa dia_pago 31 en meses de 30 días', () => {
    const r = calcFechasCiclo(20, 31, new Date(2026, 8, 5))   // pago mismo mes (31 > 20)
    expect(r.fecha_cierre).toBe('2026-09-20')
    expect(r.fecha_pago).toBe('2026-09-30')
  })

  it('cruza el año con dia_cierre 31', () => {
    const hoy = new Date(2026, 11, 31)   // 31 dic 2026, dia >= dia_cierre
    const r = calcFechasCiclo(31, 15, hoy)
    expect(r.fecha_cierre).toBe('2027-01-31')
    expect(r.fecha_inicio).toBe('2027-01-01')  // 31 dic 2026 + 1 día
    expect(r.fecha_pago).toBe('2027-02-15')
  })

  it('nunca emite un día que el mes no tiene y mantiene ciclos contiguos', () => {
    const esFechaReal = (iso: string) => {
      const [a, m, d] = iso.split('-').map(Number)
      const dt = new Date(a, m - 1, d)
      return dt.getFullYear() === a && dt.getMonth() === m - 1 && dt.getDate() === d
    }
    const diaSiguiente = (iso: string) => {
      const [a, m, d] = iso.split('-').map(Number)
      const dt = new Date(a, m - 1, d + 1)
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    }

    for (const dia of [28, 29, 30, 31]) {
      let anterior: { fecha_cierre: string } | null = null
      for (let mes = 0; mes < 26; mes++) {
        // día 2 de cada mes: siempre < dia_cierre → el cierre cae en ese mes
        const hoy = new Date(2026, mes, 2)
        const r = calcFechasCiclo(dia, dia, hoy)
        expect(esFechaReal(r.fecha_inicio)).toBe(true)
        expect(esFechaReal(r.fecha_cierre)).toBe(true)
        expect(esFechaReal(r.fecha_pago)).toBe(true)
        expect(r.fecha_inicio <= r.fecha_cierre).toBe(true)
        expect(r.fecha_cierre < r.fecha_pago).toBe(true)
        if (anterior) {
          expect(r.fecha_inicio).toBe(diaSiguiente(anterior.fecha_cierre))
        }
        anterior = r
      }
    }
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

  // ── días 29-31: el día se clampa al último día real del mes ──
  it('detecta pago vencido con dia_pago 30 el último día de febrero', () => {
    const tc = { ...TC_BASE, deuda_ciclo_anterior: 400_000, dia_pago: 30 }
    const hoy = new Date(2026, 1, 28)   // 28 feb 2026 = último día
    const alertas = calcAlertasTC([tc], hoy)
    expect(alertas).toHaveLength(1)
    expect(alertas[0].tipo).toBe('pago_vencido')
    expect(alertas[0].monto).toBe(400_000)
  })

  it('detecta pago vencido con dia_pago 29 y 31 el último día de febrero', () => {
    for (const dia_pago of [29, 31]) {
      const tc = { ...TC_BASE, deuda_ciclo_anterior: 400_000, dia_pago }
      const alertas = calcAlertasTC([tc], new Date(2026, 1, 28))
      expect(alertas.map(a => a.tipo)).toContain('pago_vencido')
    }
  })

  it('detecta pago vencido con dia_pago 31 el 30 de septiembre', () => {
    const tc = { ...TC_BASE, deuda_ciclo_anterior: 300_000, dia_pago: 31 }
    const alertas = calcAlertasTC([tc], new Date(2026, 8, 30))
    expect(alertas).toHaveLength(1)
    expect(alertas[0].tipo).toBe('pago_vencido')
  })

  it('detecta cierre próximo con dia_cierre 31 en febrero', () => {
    const tc = { ...TC_BASE, dia_cierre: 31 }
    const alertas = calcAlertasTC([tc], new Date(2026, 1, 26))   // 26 feb 2026
    expect(alertas).toHaveLength(1)
    expect(alertas[0].tipo).toBe('cierre_proximo')
    expect(alertas[0].diasRestantes).toBe(2)   // cierra el 28, no el 3 de marzo
  })
})

// ── calcResumenTC: días para cierre/pago con días 29-31 ─────
describe('calcResumenTC', () => {
  const TC: TarjetaCredito = {
    id: '1', nombre: 'Visa BI',
    limite_credito: 1_000_000,
    deuda_actual: 200_000, deuda_ciclo_anterior: 0,
    dia_cierre: 30, dia_pago: 15,
    color: '', activa: true,
  }

  it('no salta febrero para una tarjeta con cierre día 30', () => {
    vi.setSystemTime(new Date(2026, 0, 31, 12, 0, 0))   // 31 ene 2026
    const r = calcResumenTC(TC)
    expect(r.proximo_cierre.getMonth()).toBe(1)          // febrero
    expect(r.proximo_cierre.getDate()).toBe(28)
    expect(r.dias_para_cierre).toBe(28)
  })

  it('cierre día 31 en septiembre cae el 30, no el 1 de octubre', () => {
    vi.setSystemTime(new Date(2026, 8, 28, 12, 0, 0))   // 28 sep 2026
    const r = calcResumenTC({ ...TC, dia_cierre: 31 })
    expect(r.proximo_cierre.getMonth()).toBe(8)          // septiembre
    expect(r.proximo_cierre.getDate()).toBe(30)
    expect(r.dias_para_cierre).toBe(2)
  })

  it('cierre día 31 el mismo día del cierre rueda al mes siguiente clampado', () => {
    vi.setSystemTime(new Date(2026, 0, 31, 12, 0, 0))   // 31 ene 2026
    const r = calcResumenTC({ ...TC, dia_cierre: 31 })
    expect(r.proximo_cierre.getMonth()).toBe(1)          // febrero, no marzo
    expect(r.proximo_cierre.getDate()).toBe(28)
    expect(r.dias_para_cierre).toBe(28)
  })

  it('cruza el año para una tarjeta con cierre día 31 el 31 de diciembre', () => {
    vi.setSystemTime(new Date(2026, 11, 31, 12, 0, 0))
    const r = calcResumenTC({ ...TC, dia_cierre: 31 })
    expect(r.proximo_cierre.getFullYear()).toBe(2027)
    expect(r.proximo_cierre.getMonth()).toBe(0)
    expect(r.proximo_cierre.getDate()).toBe(31)
    expect(r.dias_para_cierre).toBe(31)
  })
})

describe('calcFechasCiclo — invariantes exhaustivas', () => {
  it('fecha_pago siempre cae DESPUÉS de fecha_cierre, para todo par de días y todo mes', () => {
    const fallos: string[] = []
    for (let diaCierre = 1; diaCierre <= 31; diaCierre++) {
      for (let diaPago = 1; diaPago <= 31; diaPago++) {
        // Un día de cada mes de 2026-2029, incluyendo el 29/2 de 2028
        for (let mes = 0; mes < 48; mes++) {
          const hoy = new Date(2026 + Math.floor(mes / 12), mes % 12, 14)
          const r = calcFechasCiclo(diaCierre, diaPago, hoy)
          if (!(r.fecha_pago > r.fecha_cierre)) {
            fallos.push(`cierre=${diaCierre} pago=${diaPago} hoy=${hoy.toDateString()} → cierre=${r.fecha_cierre} pago=${r.fecha_pago}`)
          }
          if (!(r.fecha_inicio <= r.fecha_cierre)) {
            fallos.push(`inicio>cierre: cierre=${diaCierre} pago=${diaPago} → ${r.fecha_inicio} / ${r.fecha_cierre}`)
          }
          // Toda fecha emitida debe existir en el calendario
          for (const f of [r.fecha_inicio, r.fecha_cierre, r.fecha_pago]) {
            const [a, m, d] = f.split('-').map(Number)
            const real = new Date(a, m - 1, d)
            if (real.getFullYear() !== a || real.getMonth() !== m - 1 || real.getDate() !== d) {
              fallos.push(`fecha inexistente ${f} (cierre=${diaCierre} pago=${diaPago})`)
            }
          }
        }
      }
    }
    expect(fallos.slice(0, 5)).toEqual([])
  })
})

describe('calcAnillosPresupuesto', () => {
  const pres = [
    { categoria: 'Comida', monto_limite: 100000 },
    { categoria: 'Transporte', monto_limite: 50000 },
    { categoria: 'Ocio', monto_limite: 20000 },
    { categoria: 'Salud', monto_limite: 40000 },
  ]
  const gasto = { Comida: 72000, Transporte: 10000, Ocio: 30000 }

  it('ordena por % usado, de más a menos, y se queda con n', () => {
    const r = calcAnillosPresupuesto(pres, gasto, 3)
    expect(r.map(a => a.categoria)).toEqual(['Ocio', 'Comida', 'Transporte'])
    expect(r[0]).toEqual({ categoria: 'Ocio', gastado: 30000, limite: 20000, pct: 150, estado: 'excedido' })
    expect(r[1]).toMatchObject({ pct: 72, estado: 'ok' })
  })

  it('una categoría sin gasto cuenta 0 %, no se omite', () => {
    const r = calcAnillosPresupuesto(pres, gasto, 4)
    expect(r[3]).toEqual({ categoria: 'Salud', gastado: 0, limite: 40000, pct: 0, estado: 'ok' })
  })

  it('a igual %, desempata por nombre para que el orden no baile', () => {
    const r = calcAnillosPresupuesto(
      [{ categoria: 'B', monto_limite: 100 }, { categoria: 'A', monto_limite: 100 }], {}, 2,
    )
    expect(r.map(a => a.categoria)).toEqual(['A', 'B'])
  })

  it('salta un límite no positivo en lugar de lanzar', () => {
    const r = calcAnillosPresupuesto([{ categoria: 'X', monto_limite: 0 }, ...pres], gasto)
    expect(r.map(a => a.categoria)).not.toContain('X')
    expect(r).toHaveLength(3)
  })

  it('sin presupuestos devuelve vacío', () => {
    expect(calcAnillosPresupuesto([], gasto)).toEqual([])
  })
})

describe('calcProximoPagoTC', () => {
  const tc = (id: string, anterior: number) => ({ id, deuda_ciclo_anterior: anterior }) as TarjetaCredito
  const res = (dias: number) => ({ dias_para_pago: dias }) as ResumenTC

  it('elige la de pago más cercano entre las que deben del ciclo cerrado', () => {
    const r = calcProximoPagoTC([
      { tc: tc('a', 5000), resumen: res(12) },
      { tc: tc('b', 0), resumen: res(1) },        // no debe nada vencido: no cuenta
      { tc: tc('c', 800), resumen: res(4) },
    ])
    expect(r?.tc.id).toBe('c')
  })

  it('sin deuda vencida en ninguna devuelve null', () => {
    expect(calcProximoPagoTC([{ tc: tc('a', 0), resumen: res(3) }])).toBeNull()
    expect(calcProximoPagoTC([])).toBeNull()
  })

  it('a igual distancia se queda con la primera, para que no salte', () => {
    const r = calcProximoPagoTC([
      { tc: tc('a', 1), resumen: res(5) },
      { tc: tc('b', 1), resumen: res(5) },
    ])
    expect(r?.tc.id).toBe('a')
  })
})

describe('agruparPorDia', () => {
  type T = Parameters<typeof agruparPorDia>[0][number] & { id: string }
  const t = (id: string, fecha: string, tipo: T['tipo'], cantidad: number): T => ({ id, fecha, tipo, cantidad })

  it('agrupa por fecha conservando el orden de llegada', () => {
    const g = agruparPorDia([
      t('a', '2026-09-23', 'gasto', -100), t('b', '2026-09-23', 'ingreso', 500),
      t('c', '2026-09-21', 'gasto', -50),
    ])
    expect(g.map(x => x.fecha)).toEqual(['2026-09-23', '2026-09-21'])
    expect(g[0].txns.map(x => x.id)).toEqual(['a', 'b'])
    expect(g[0].neto).toBe(400)
    expect(g[1].neto).toBe(-50)
  })

  it('el gasto con tarjeta resta; el pago de tarjeta y los ajustes no mueven el neto', () => {
    const g = agruparPorDia([
      t('a', '2026-09-23', 'gasto_tc', -300),
      t('b', '2026-09-23', 'pago_tc', -1000),
      t('c', '2026-09-23', 'ajuste', 2000),
    ])
    expect(g[0].neto).toBe(-300)
  })

  it('sin movimientos no hay grupos', () => {
    expect(agruparPorDia([])).toEqual([])
  })
})

describe('simboloMoneda', () => {
  it('el símbolo corto del locale, igual que en los montos', () => {
    expect(simboloMoneda({ moneda: 'GTQ', locale: 'es-GT' })).toBe('Q')
    expect(simboloMoneda({ moneda: 'USD', locale: 'es-GT' })).toBe('$')
    expect(simboloMoneda({ moneda: 'EUR', locale: 'de-DE' })).toBe('€')
  })

  it('con un código inválido devuelve el código en lugar de lanzar', () => {
    expect(simboloMoneda({ moneda: 'XXXX', locale: 'es-GT' })).toBe('XXXX')
  })
})

describe('calcRebanadasCategorias', () => {
  it('ordena de mayor a menor, con % del total', () => {
    const { rebanadas, total } = calcRebanadasCategorias({ A: 300, B: 100, C: 600, D: 0 })
    expect(total).toBe(1000)
    expect(rebanadas).toEqual([
      { cat: 'C', valor: 600, pct: 60 },
      { cat: 'A', valor: 300, pct: 30 },
      { cat: 'B', valor: 100, pct: 10 },
    ])
  })

  it('agrupa la cola en "Otros"', () => {
    const { rebanadas } = calcRebanadasCategorias({ A: 50, B: 40, C: 5, D: 5 }, 2)
    expect(rebanadas.map(r => [r.cat, r.valor])).toEqual([['A', 50], ['B', 40], ['Otros', 10]])
  })

  it('si "Otros" ya es una categoría grande, le suma la cola y reordena', () => {
    const { rebanadas } = calcRebanadasCategorias({ A: 50, Otros: 30, C: 15, D: 10 }, 2)
    expect(rebanadas.map(r => [r.cat, r.valor])).toEqual([['Otros', 55], ['A', 50]])
  })

  it('sin gastos no hay rebanadas', () => {
    expect(calcRebanadasCategorias({})).toEqual({ rebanadas: [], total: 0 })
    expect(calcRebanadasCategorias({ A: 0 })).toEqual({ rebanadas: [], total: 0 })
  })
})

describe('promedioCentavos', () => {
  it('redondea a entero y devuelve 0 sin datos', () => {
    expect(promedioCentavos([100, 200, 201])).toBe(167)
    expect(promedioCentavos([])).toBe(0)
  })
})
