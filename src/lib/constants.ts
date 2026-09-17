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

// Fecha de hoy en zona horaria Guatemala (UTC-6, sin DST)
export const hoyGT = (): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' })

// Date con los campos de calendario de HOY en Guatemala.
// Se ancla al mediodía local para que getFullYear/getMonth/getDate nunca
// se corran por DST ni por el cruce de medianoche. No es un instante real
// en GT: sirve solo para leer campos de calendario.
export const ahoraGT = (): Date => new Date(`${hoyGT()}T12:00:00`)

// Mes actual ('YYYY-MM') en zona horaria Guatemala — igual que hoyGT(),
// no el calendario del navegador.
export const mesActual = (): string => hoyGT().substring(0, 7)

export const TIPOS_INVERSION = [
  { value: 'fondo',     label: 'Fondo de inversión' },
  { value: 'acciones',  label: 'Acciones / ETF' },
  { value: 'cdp',       label: 'CDP / Depósito a plazo' },
  { value: 'crypto',    label: 'Criptomonedas' },
  { value: 'inmueble',  label: 'Inmueble / Bien raíz' },
  { value: 'otro',      label: 'Otro' },
] as const
