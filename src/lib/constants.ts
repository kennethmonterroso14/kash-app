/**
 * Cuentas sugeridas para el onboarding, SIN saldo: cada usuario pone el suyo.
 *
 * Antes acá vivían los saldos bancarios reales de una persona (nueve cuentas
 * con montos). Eran exports muertos, nadie los importaba, y con la app pensada
 * para terceros eso no puede estar en el repo. Si el onboarding de la Fase 2
 * los necesita, esta plantilla es el punto de partida.
 */
export const CUENTAS_SUGERIDAS = [
  { nombre: 'Cuenta de ahorros', tipo: 'ahorro',   color: '#4ade80' },
  { nombre: 'Cuenta monetaria',  tipo: 'corriente', color: '#60a5fa' },
  { nombre: 'Efectivo',          tipo: 'efectivo', color: '#fb923c' },
] as const

export const CATEGORIAS_GASTO = [
  'Comida/Restaurantes', 'Gasolina/Carro', 'Supermercado', 'Gym/Deporte',
  'Suscripciones', 'Telecom', 'Parqueo', 'Ropa/Personal', 'Entretenimiento',
  'Familia/Regalos', 'Iglesia/Donaciones', 'Suplementos', 'Transporte',
  'Pago Deudas', 'Otros',
]

export const CATEGORIAS_INGRESO = ['Ingreso', 'Familia/Regalos', 'Otros']

// Color cuando una categoría no tiene uno asignado. Vive acá y no como hex
// suelto en las páginas: si no, un cambio de paleta dejaría este gris viejo.
export const COLOR_CATEGORIA_FALLBACK = '#6b7590'

export const CAT_COLORS: Record<string, string> = {
  'Comida/Restaurantes': '#c8f564',
  'Gasolina/Carro':      '#ff7c5c',
  'Supermercado':        '#60a5fa',
  'Gym/Deporte':         '#a78bfa',
  'Suscripciones':       '#fbbf24',
  'Telecom':             '#34d399',
  'Parqueo':             '#fb923c',
  'Ropa/Personal':       '#f472b6',
  'Entretenimiento':     '#e879f9',
  'Familia/Regalos':     '#67e8f9',
  'Pago Deudas':         '#ff5252',
  'Ingreso':             '#69f0ae',
  'Ajuste de cuenta':    '#94a3b8',
  'Otros':               '#6b7590',
  'Iglesia/Donaciones':  '#fde68a',
  'Suplementos':         '#86efac',
  'Transporte':          '#c4b5fd',
  'Transferencia':       '#67e8f9',
}

export const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

// ─── FECHAS ───────────────────────────────────────────────────────────
//
// Todo lo que se guarda se fecha en la zona horaria del USUARIO, no en la del
// navegador. Ojo con el alcance de esto: de acá salen los límites de mes de
// todas las consultas, así que cambiarle la zona a un usuario mueve qué
// transacciones caen en qué mes. Se parametriza ahora; el selector en la UI es
// de la Fase 2.

/** Default de `profiles.zona_horaria`. UTC-6, sin horario de verano. */
export const ZONA_GT = 'America/Guatemala'

const formateadoresFecha = new Map<string, Intl.DateTimeFormat>()

/**
 * `true` si es una zona IANA que este runtime conoce.
 *
 * Existe porque las funciones de abajo LANZAN con una zona inválida, y quien
 * lee el perfil necesita poder detectarlo y mostrar un error en lugar de que
 * el render se caiga. No tiene un default a propósito: adivinar la zona
 * escribiría fechas equivocadas en la base, que es peor que no escribir nada.
 */
export function zonaValida(zona: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zona })
    return true
  } catch {
    return false
  }
}

function formateadorFecha(zona: string): Intl.DateTimeFormat {
  const guardado = formateadoresFecha.get(zona)
  if (guardado) return guardado
  // Campos explícitos y no `toLocaleDateString('en-CA')` pelado: así el
  // 'YYYY-MM-DD' no depende de qué formato le dé ICU a ese locale.
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  formateadoresFecha.set(zona, f)
  return f
}

/** Hoy como 'YYYY-MM-DD' en una zona horaria. Lanza si la zona no existe. */
export const hoyEn = (zona: string): string => formateadorFecha(zona).format(new Date())

/**
 * Date con los campos de calendario de HOY en una zona.
 * Se ancla al mediodía local para que getFullYear/getMonth/getDate nunca se
 * corran por DST ni por el cruce de medianoche. NO es un instante real en esa
 * zona: sirve solo para leer campos de calendario.
 */
export const ahoraEn = (zona: string): Date => new Date(`${hoyEn(zona)}T12:00:00`)

/** Mes actual ('YYYY-MM') en una zona horaria. */
export const mesActualEn = (zona: string): string => hoyEn(zona).substring(0, 7)

// Los alias hoyGT/ahoraGT/mesActual se retiraron en la tarea 1.4.7: ya no
// quedaba ningún sitio que asumiera Guatemala. Todo pasa por `useFechas()`, que
// currifica estas funciones con la zona del perfil. Las dos excepciones, ambas
// documentadas en su archivo, reciben la zona por parámetro porque no pueden
// consumir el contexto: `useTarjetas` (lo monta el provider) y el test helper.

/**
 * Inflación anual de referencia, en %. Es el umbral contra el que se dice si una
 * inversión "supera la inflación".
 *
 * Está cableado a Guatemala. Con la app abierta a más países esto tendría que
 * salir del perfil, como la moneda y la zona horaria — queda anotado en el
 * roadmap; parametrizarlo ahora sin un dato por país solo movería el problema.
 */
export const INFLACION_ANUAL_REF = 4

export const TIPOS_INVERSION = [
  { value: 'fondo',     label: 'Fondo de inversión' },
  { value: 'acciones',  label: 'Acciones / ETF' },
  { value: 'cdp',       label: 'CDP / Depósito a plazo' },
  { value: 'crypto',    label: 'Criptomonedas' },
  { value: 'inmueble',  label: 'Inmueble / Bien raíz' },
  { value: 'otro',      label: 'Otro' },
] as const
