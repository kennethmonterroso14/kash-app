// ─── FORMATEO ────────────────────────────────────────────────

export interface OpcionesMoneda {
  /** Código ISO 4217: 'GTQ', 'USD', 'HNL', … */
  moneda: string
  /** Etiqueta BCP 47: 'es-GT', 'en-US', … Decide separadores y posición. */
  locale: string
}

/** El default de `profiles`. NO es una constante global: la moneda sale del perfil. */
export const MONEDA_GT: OpcionesMoneda = { moneda: 'GTQ', locale: 'es-GT' }

// Construir un Intl.NumberFormat no es gratis y esto se llama por fila
// renderizada, así que se memoizan por par locale+moneda. Son dos o tres por
// sesión (la moneda del perfil, y USD en inversiones).
const formateadores = new Map<string, Intl.NumberFormat>()

function formateador(locale: string, moneda: string): Intl.NumberFormat | null {
  const clave = `${locale}|${moneda}`
  const guardado = formateadores.get(clave)
  if (guardado) return guardado
  try {
    const f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: moneda,
      // Sin narrowSymbol, 'es-GT' + USD sale como "USD 1,234.56" en lugar
      // de "$1,234.56".
      currencyDisplay: 'narrowSymbol',
      // Forzados porque el modelo de datos guarda centésimos SIEMPRE. El
      // default de ICU para COP es 0 decimales, y respetarlo redondearía el
      // monto guardado. (Corolario: una moneda sin centésimos, como JPY, no
      // encaja en este modelo de datos, no solo en este formateador.)
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    formateadores.set(clave, f)
    return f
  } catch {
    // Un locale mal formado o un código de moneda inválido lanzan RangeError.
    // Acá NO se lanza: esto corre en render y tumbaría el árbol por un dato de
    // configuración. El fallback de abajo muestra el código, que es honesto
    // ("GTQ 1,234.56") en lugar de inventar un símbolo.
    return null
  }
}

/**
 * Convierte centavos al formato de una moneda y un locale.
 *
 * Es PURA a propósito: no lee el contexto de sesión. Quien tiene el perfil es
 * `useMoneda()`, que currifica esta función con la moneda y el locale del
 * usuario. Meter el contexto acá rompería tanto la pureza como los tests.
 *
 *   formatMoneda(123456, { moneda: 'GTQ', locale: 'es-GT' })  → "Q1,234.56"
 *   formatMoneda(123456, { moneda: 'USD', locale: 'en-US' })  → "$1,234.56"
 *   formatMoneda(123456, { moneda: 'EUR', locale: 'de-DE' })  → "1.234,56 €"
 */
export function formatMoneda(centavos: number, { moneda, locale }: OpcionesMoneda): string {
  if (!Number.isInteger(centavos)) {
    throw new Error(`formatMoneda espera un entero (centavos). Recibió: ${centavos}`)
  }
  const unidades = centavos / 100
  const f = formateador(locale, moneda)
  if (!f) {
    const abs = Math.abs(unidades).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return `${unidades < 0 ? '-' : ''}${moneda} ${abs}`
  }

  // Se arma por partes para poder quitar el espacio ENTRE el símbolo y el
  // número cuando el símbolo va adelante ("Q 1,234.56" → "Q1,234.56", que es
  // como se ve la app hoy) sin tocar los locales que lo ponen atrás, donde el
  // espacio sí es correcto ("1.234,56 €").
  const partes = f.formatToParts(unidades)
  return partes
    .filter((parte, i) => !(
      parte.type === 'literal' &&
      /^\s+$/.test(parte.value) &&
      partes[i - 1]?.type === 'currency'
    ))
    .map(parte => parte.value)
    .join('')
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
  tipo: 'ingreso' | 'gasto' | 'ajuste' | 'gasto_tc' | 'pago_tc'
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

/**
 * ¿Este movimiento cuenta como gasto del mes?
 *
 * Fuente única de verdad: un gasto con tarjeta (`gasto_tc`) es gasto igual que
 * uno de cuenta. `pago_tc` NO lo es — mueve deuda, no es consumo nuevo, y
 * contarlo duplicaría el gasto (una vez al comprar, otra al pagar la tarjeta).
 *
 * Existe para que agregar un tipo nuevo sea UN cambio y no tres: antes este
 * criterio estaba repetido en finanzas.ts, BudgetPage y useResumen6Meses, y
 * olvidar uno hacía que el Dashboard y Presupuestos reportaran cifras
 * distintas del mismo mes.
 */
export const esGastoComputable = (tipo: string): boolean =>
  tipo === 'gasto' || tipo === 'gasto_tc'

export function calcEstadisticasMes(
  transacciones: Transaccion[]
): EstadisticasMes {
  const ingresos = transacciones
    .filter(t => t.tipo === 'ingreso')
    .reduce((sum, t) => sum + t.cantidad, 0)

  const gastos = transacciones
    .filter(t => esGastoComputable(t.tipo))
    .reduce((sum, t) => sum + Math.abs(t.cantidad), 0)

  const neto = ingresos - gastos
  const pctAhorro = ingresos > 0
    ? Math.round((neto / ingresos) * 100)
    : 0

  const porCategoria: Record<string, number> = {}
  transacciones
    .filter(t => esGastoComputable(t.tipo))
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

// ─── TARJETAS DE CRÉDITO ─────────────────────────────────────

export interface TarjetaCredito {
  id: string
  nombre: string
  banco?: string
  ultimos_4?: string
  limite_credito: number       // centavos
  deuda_actual: number         // centavos — ciclo abierto (no facturado aún)
  deuda_ciclo_anterior: number // centavos — ya facturado, pendiente de pago
  dia_cierre: number
  dia_pago: number
  color: string
  activa: boolean
}

export interface ResumenTC {
  disponible: number           // limite - deuda_actual
  deuda_total: number          // deuda_actual + deuda_ciclo_anterior
  pct_uso: number              // 0-100
  estado: 'ok' | 'alerta' | 'critico'
  dias_para_cierre: number
  dias_para_pago: number
  proximo_cierre: Date
  proximo_pago: Date
}

export interface DisponibleReal {
  saldo_cuentas: number
  deuda_tc_vencida: number     // deuda_ciclo_anterior (ya hay que pagar)
  deuda_tc_acumulando: number  // deuda_actual (ciclo abierto, aún no vence)
  disponible_real: number      // saldo_cuentas - deuda_tc_vencida - deuda_tc_acumulando
  advertencia: string | null
}

export interface PatrimonioNeto {
  activos: number              // cuentas + inversiones
  pasivos: number              // toda la deuda TC (actual + ciclo anterior)
  neto: number
  tendencia: 'positiva' | 'negativa' | 'neutral'
}

/**
 * Limita `dia` al último día real del mes indicado (mes 0-11, estilo Date.getMonth).
 * Ej: _diaClamp(2026, 1, 31) → 28 (febrero 2026 no es bisiesto)
 */
function _diaClamp(año: number, mes: number, dia: number): number {
  // día 0 del mes siguiente = último día de `mes`
  return Math.min(dia, new Date(año, mes + 1, 0).getDate())
}

/** Date local del `dia` (clampado) de un mes 1-12. */
function _diaEnMes(año: number, mes: number, dia: number): Date {
  return new Date(año, mes - 1, _diaClamp(año, mes - 1, dia))
}

/** Formatea un Date local como 'YYYY-MM-DD' sin depender de locale ni de UTC. */
function _fechaISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Próxima ocurrencia del `dia` del mes a partir de `desde` (exclusivo).
 * El día se clampa al último día real del mes objetivo, así que una tarjeta
 * con cierre 31 cierra el 28/29 en febrero y el 30 en los meses de 30 días,
 * en lugar de desbordarse al mes siguiente. Conserva la hora de `desde`.
 */
function _proximaFechaDelDia(desde: Date, dia: number): Date {
  const año = desde.getFullYear()
  const mes = desde.getMonth()

  const esteMes = new Date(desde)
  esteMes.setDate(_diaClamp(año, mes, dia))
  if (esteMes > desde) return esteMes

  const sigAño = mes === 11 ? año + 1 : año
  const sigMes = (mes + 1) % 12
  const siguiente = new Date(desde)
  // setFullYear(y, m, d) asigna los tres campos a la vez → no hay desbordamiento
  siguiente.setFullYear(sigAño, sigMes, _diaClamp(sigAño, sigMes, dia))
  return siguiente
}

export function calcResumenTC(tc: TarjetaCredito): ResumenTC {
  const disponible = tc.limite_credito - tc.deuda_actual
  const deuda_total = tc.deuda_actual + tc.deuda_ciclo_anterior
  const pct_uso = Math.round((tc.deuda_actual / tc.limite_credito) * 100)
  const estado = pct_uso >= 90 ? 'critico' : pct_uso >= 70 ? 'alerta' : 'ok'

  const hoy = new Date()
  const proximo_cierre = _proximaFechaDelDia(hoy, tc.dia_cierre)
  const proximo_pago   = _proximaFechaDelDia(hoy, tc.dia_pago)
  const MS_DIA = 1000 * 60 * 60 * 24

  return {
    disponible,
    deuda_total,
    pct_uso,
    estado,
    dias_para_cierre: Math.ceil((proximo_cierre.getTime() - hoy.getTime()) / MS_DIA),
    dias_para_pago:   Math.ceil((proximo_pago.getTime()   - hoy.getTime()) / MS_DIA),
    proximo_cierre,
    proximo_pago,
  }
}

/**
 * `moneda` entra por parámetro porque una de las tres advertencias cita un
 * monto, y con la moneda cableada un usuario en dólares leería quetzales. La
 * función sigue siendo pura: las opciones son datos, no contexto.
 */
export function calcDisponibleReal(
  saldoCuentas: number,
  tarjetas: TarjetaCredito[],
  moneda: OpcionesMoneda,
): DisponibleReal {
  const deuda_tc_vencida    = tarjetas.reduce((s, tc) => s + tc.deuda_ciclo_anterior, 0)
  const deuda_tc_acumulando = tarjetas.reduce((s, tc) => s + tc.deuda_actual, 0)
  const deuda_total_tc      = deuda_tc_vencida + deuda_tc_acumulando
  const disponible_real     = saldoCuentas - deuda_total_tc

  const advertencia =
    disponible_real < 0
      ? `Tu deuda total de TC (${formatMoneda(deuda_total_tc, moneda)}) supera tu saldo en cuentas`
      : deuda_tc_vencida > 0 && deuda_tc_vencida > saldoCuentas * 0.5
      ? `Más del 50% de tu saldo está comprometido con pagos de TC pendientes`
      : deuda_total_tc > saldoCuentas * 0.8
      ? `Tu deuda total de TC representa más del 80% de tu saldo disponible`
      : null

  return {
    saldo_cuentas: saldoCuentas,
    deuda_tc_vencida,
    deuda_tc_acumulando,
    disponible_real,
    advertencia,
  }
}

export function calcPatrimonioNeto(
  saldoCuentas: number,
  valorInversiones: number,
  tarjetas: TarjetaCredito[]
): PatrimonioNeto {
  const activos  = saldoCuentas + valorInversiones
  const pasivos  = tarjetas.reduce(
    (s, tc) => s + tc.deuda_actual + tc.deuda_ciclo_anterior, 0
  )
  const neto     = activos - pasivos
  const tendencia = neto > 0 ? 'positiva' : neto < 0 ? 'negativa' : 'neutral'
  return { activos, pasivos, neto, tendencia }
}

// ─── INVERSIONES ─────────────────────────────────────

export interface Inversion {
  id: string
  nombre: string
  plataforma?: string
  tipo: string
  monto_invertido: number      // centavos en la moneda indicada
  valor_actual: number         // centavos en la moneda indicada
  moneda: 'GTQ' | 'USD'
  fecha_inicio: string         // 'YYYY-MM-DD'
  fecha_ultimo_update?: string
  notas?: string
  activa: boolean
}

export interface InversionHistorial {
  id: string
  inversion_id: string
  valor: number                // centavos en la moneda de la inversión
  fecha: string                // 'YYYY-MM-DD'
}

export interface ResumenPortafolio {
  capital_total: number        // centavos GTQ
  valor_total: number          // centavos GTQ
  ganancia_total: number       // centavos GTQ (puede ser negativo)
  ganancia_pct: number         // porcentaje
  rendimiento_anualizado: number  // CAGR promedio ponderado, porcentaje
}

/**
 * Convierte centavos USD a centavos GTQ.
 * tipoCambioUSD: centavos GTQ por 1 USD (ej: 775 = Q7.75/USD)
 * Ejemplo: usdToGTQ(10_000, 775) → 77_500  ($100 × Q7.75 = Q775)
 */
export function usdToGTQ(montoUSD_centavos: number, tipoCambioUSD: number): number {
  if (tipoCambioUSD <= 0) throw new Error('tipoCambioUSD debe ser > 0')
  return Math.round(montoUSD_centavos * tipoCambioUSD / 100)
}

/**
 * Calcula el Compound Annual Growth Rate (CAGR) para una inversión.
 * Retorna porcentaje (ej: 8.5 = 8.5%). Mínimo 1 día para evitar división por cero.
 * Nota: opera sobre los valores nativos de la inversión (cualquier moneda).
 */
export function calcRendimientoAnualizado(
  montoInvertido: number,  // centavos (moneda nativa)
  valorActual: number,     // centavos (moneda nativa)
  fechaInicio: string      // 'YYYY-MM-DD'
): number {
  if (montoInvertido <= 0) throw new Error('monto_invertido debe ser > 0')
  const inicio = new Date(fechaInicio + 'T12:00:00')
  const dias = Math.max(30, Math.floor((Date.now() - inicio.getTime()) / (1000 * 60 * 60 * 24)))
  const ratio = valorActual / montoInvertido
  if (ratio <= 0) return -100
  return (Math.pow(ratio, 365 / dias) - 1) * 100
}

/**
 * Calcula resumen del portafolio. Todos los valores de retorno están en GTQ centavos.
 * Las inversiones en USD se convierten usando tipoCambioUSD antes de sumar.
 * El rendimiento anualizado es CAGR ponderado por capital en GTQ.
 */
export function calcResumenPortafolio(
  inversiones: Inversion[],
  tipoCambioUSD: number = 775
): ResumenPortafolio {
  const activas = inversiones.filter(i => i.activa)
  if (activas.length === 0) {
    return { capital_total: 0, valor_total: 0, ganancia_total: 0, ganancia_pct: 0, rendimiento_anualizado: 0 }
  }

  const toGTQ = (inv: Inversion, val: number): number =>
    inv.moneda === 'USD' ? usdToGTQ(val, tipoCambioUSD) : val

  const capital_total = activas.reduce((s, i) => s + toGTQ(i, i.monto_invertido), 0)
  const valor_total   = activas.reduce((s, i) => s + toGTQ(i, i.valor_actual),    0)
  const ganancia_total  = valor_total - capital_total
  const ganancia_pct    = capital_total > 0 ? (ganancia_total / capital_total) * 100 : 0

  const rendimiento_anualizado = capital_total > 0
    ? activas.reduce((sum, inv) => {
        if (inv.monto_invertido <= 0) return sum   // guard: skip invalid investments
        const pesoGTQ = toGTQ(inv, inv.monto_invertido) / capital_total
        const rend = calcRendimientoAnualizado(inv.monto_invertido, inv.valor_actual, inv.fecha_inicio)
        return sum + rend * pesoGTQ
      }, 0)
    : 0

  return { capital_total, valor_total, ganancia_total, ganancia_pct, rendimiento_anualizado }
}

/**
 * Computa la evolución total del portafolio para la gráfica.
 * Para cada fecha única del historial de las inversiones ACTIVAS, suma el último
 * valor conocido de cada inversión activa (convirtiendo a GTQ).
 * Una inversión sin historial previo a esa fecha usa monto_invertido, pero solo
 * si la fecha es >= su fecha_inicio: antes de existir aporta 0.
 */
export function computeEvolucionPortafolio(
  inversiones: Inversion[],
  historial: InversionHistorial[],
  tipoCambioUSD: number = 775
): Array<{ fecha: string; valor_total: number }> {
  const activas = inversiones.filter(i => i.activa)
  // Solo fechas de inversiones activas: una inversión archivada no debe inyectar
  // fechas al eje X si sus valores quedan fuera de la suma (reescribiría el pasado).
  const idsActivas = new Set(activas.map(i => i.id))
  const histActivo = historial.filter(h => idsActivas.has(h.inversion_id))

  const fechas = [...new Set(histActivo.map(h => h.fecha))].sort()
  if (fechas.length === 0) return []

  const toGTQ = (inv: Inversion, val: number): number =>
    inv.moneda === 'USD' ? usdToGTQ(val, tipoCambioUSD) : val

  return fechas.map(fecha => {
    const valor_total = activas.reduce((sum, inv) => {
      const entradas = histActivo
        .filter(h => h.inversion_id === inv.id && h.fecha <= fecha)
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
      // Antes de fecha_inicio la inversión no existía → aporta 0
      if (entradas.length === 0 && fecha < inv.fecha_inicio) return sum
      const val = entradas[0]?.valor ?? inv.monto_invertido
      return sum + toGTQ(inv, val)
    }, 0)
    return { fecha, valor_total }
  })
}

// ─── CICLOS DE TARJETA DE CRÉDITO ────────────────────────────────

export interface CicloTC {
  id: string
  tarjeta_id: string
  user_id: string
  fecha_inicio: string   // 'YYYY-MM-DD'
  fecha_cierre: string   // 'YYYY-MM-DD'
  fecha_pago: string     // 'YYYY-MM-DD'
  total_cargos: number   // centavos
  total_pagos: number    // centavos
  saldo_final: number    // centavos
  estado: 'abierto' | 'cerrado' | 'pagado'
  /**
   * Instante REAL del cierre, o null si el ciclo está abierto — o si se cerró
   * antes de que la columna existiera (tarea 4.1), y entonces ese tramo de la
   * historia no es derivable. `fecha_cierre` es la fecha teórica del corte y no
   * dice cuándo pasó nada: el usuario cierra cuando quiere.
   */
  cerrado_at: string | null
}

export interface AlertaTC {
  tipo: 'cierre_proximo' | 'pago_vencido'
  tc: TarjetaCredito
  diasRestantes?: number   // para cierre_proximo (0-3)
  monto?: number           // para pago_vencido (centavos)
}

/**
 * Calcula las fechas de un nuevo ciclo de TC dado el día de cierre y pago.
 * Siempre retorna el ciclo vigente a partir de `hoy`.
 *
 * Reglas:
 * - Si hoy < dia_cierre: el cierre es este mes → inicio = dia_cierre+1 del mes anterior
 * - Si hoy >= dia_cierre: el cierre es el mes siguiente → inicio = dia_cierre+1 de este mes
 * - El pago siempre cae DESPUÉS del cierre:
 *   si diaPago > diaCierre: mismo mes que el cierre
 *   si diaPago <= diaCierre: mes siguiente al cierre
 *
 * Los días se clampan al último día real del mes objetivo (cierre 31 → 28/29 en
 * febrero, 30 en abril/junio/septiembre/noviembre), porque ciclos_tc.fecha_cierre
 * y .fecha_pago son columnas `date` y Postgres rechaza un '2026-02-31'.
 */
export function calcFechasCiclo(
  diaCierre: number,
  diaPago: number,
  hoy: Date = new Date()
): { fecha_inicio: string; fecha_cierre: string; fecha_pago: string } {
  const año = hoy.getFullYear()
  const mes = hoy.getMonth() + 1   // 1-12
  const dia = hoy.getDate()

  // Mes del próximo cierre
  let cierreAño = año
  let cierreMes = mes
  if (dia >= diaCierre) {
    cierreMes += 1
    if (cierreMes > 12) { cierreMes = 1; cierreAño += 1 }
  }
  const fechaCierre = _fechaISO(_diaEnMes(cierreAño, cierreMes, diaCierre))

  // Inicio = día siguiente al cierre ANTERIOR ya clampado, para que dos ciclos
  // consecutivos siempre sean contiguos (feb cierra el 28 → marzo inicia el 1)
  let inicioAño = cierreAño
  let inicioMes = cierreMes - 1
  if (inicioMes < 1) { inicioMes = 12; inicioAño -= 1 }
  const inicioDate = _diaEnMes(inicioAño, inicioMes, diaCierre)
  inicioDate.setDate(inicioDate.getDate() + 1)
  const fechaInicio = _fechaISO(inicioDate)

  // Pago: después del cierre
  let pagoAño = cierreAño
  let pagoMes = cierreMes
  if (diaPago <= diaCierre) {
    pagoMes += 1
    if (pagoMes > 12) { pagoMes = 1; pagoAño += 1 }
  }
  let fechaPago = _fechaISO(_diaEnMes(pagoAño, pagoMes, diaPago))
  if (fechaPago <= fechaCierre) {
    // El mes del pago se elige con los días nominales pero el día se clampa
    // aparte, así que cuando AMBOS exceden el largo del mes los dos caen en el
    // último día y el pago colapsa sobre el cierre (p. ej. cierre 29 / pago 31
    // en febrero). Se conserva la ventana de gracia nominal del banco.
    // Solo alcanzable en la rama del mismo mes, donde diaPago > diaCierre.
    const conGracia = _diaEnMes(cierreAño, cierreMes, diaCierre)
    conGracia.setDate(conGracia.getDate() + (diaPago - diaCierre))
    fechaPago = _fechaISO(conGracia)
  }

  return { fecha_inicio: fechaInicio, fecha_cierre: fechaCierre, fecha_pago: fechaPago }
}

/**
 * Genera alertas para tarjetas con cierre próximo (≤3 días) o pago vencido.
 * Pago vencido = deuda_ciclo_anterior > 0 Y hoy >= dia_pago de este mes.
 * Las alertas de pago vencido van primero (mayor urgencia).
 */
export function calcAlertasTC(
  tarjetas: TarjetaCredito[],
  hoy: Date = new Date()
): AlertaTC[] {
  const MS_DIA = 1000 * 60 * 60 * 24
  const alertas: AlertaTC[] = []

  for (const tc of tarjetas) {
    // Pago vencido
    if (tc.deuda_ciclo_anterior > 0) {
      const diaPagoEsteMes = new Date(
        hoy.getFullYear(),
        hoy.getMonth(),
        _diaClamp(hoy.getFullYear(), hoy.getMonth(), tc.dia_pago)
      )
      if (hoy >= diaPagoEsteMes) {
        alertas.push({ tipo: 'pago_vencido', tc, monto: tc.deuda_ciclo_anterior })
      }
    }
    // Cierre próximo
    const proximoCierre = _proximaFechaDelDia(hoy, tc.dia_cierre)
    const dias = Math.ceil((proximoCierre.getTime() - hoy.getTime()) / MS_DIA)
    if (dias <= 3) {
      alertas.push({ tipo: 'cierre_proximo', tc, diasRestantes: dias })
    }
  }

  // Pago vencido primero
  return alertas.sort((a, b) => {
    if (a.tipo === 'pago_vencido' && b.tipo !== 'pago_vencido') return -1
    if (b.tipo === 'pago_vencido' && a.tipo !== 'pago_vencido') return 1
    return 0
  })
}
