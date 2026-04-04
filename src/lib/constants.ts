// Cuentas iniciales de Kenneth — saldos al 2026-03-30
// Valores en centavos (enteros)
export const CUENTAS_INICIALES = [
  { nombre: 'BI Ahorros',   tipo: 'ahorro',   saldo: 1130618, color: '#4ade80' },
  { nombre: 'BI Monetaria', tipo: 'ahorro',   saldo: 34645,   color: '#34d399' },
  { nombre: 'BAC ahorros',  tipo: 'ahorro',   saldo: 87004,   color: '#60a5fa' },
  { nombre: 'Zigi',         tipo: 'ahorro',   saldo: 1993,    color: '#e879f9' },
  { nombre: 'Nexa',         tipo: 'ahorro',   saldo: 15726,   color: '#fbbf24' },
  { nombre: 'Intercop',     tipo: 'otro',     saldo: 67887,   color: '#f472b6' },
  { nombre: 'Billetera',    tipo: 'efectivo', saldo: 219500,  color: '#fb923c' },
  { nombre: 'Cash',         tipo: 'efectivo', saldo: 10000,   color: '#94a3b8' },
  { nombre: 'Ahorro Cash',  tipo: 'efectivo', saldo: 148500,  color: '#facc15' },
] as const

// Presupuestos mensuales en centavos
export const PRESUPUESTOS_INICIALES: Record<string, number> = {
  'Comida/Restaurantes': 50000,
  'Gasolina/Carro':      40000,
  'Pago Deudas':         25700,
  'Gym/Deporte':         24000,
  'Familia/Regalos':     20000,
  'Telecom':             12000,
  'Suscripciones':       2353,
  'Parqueo':             2500,
}

export const CATEGORIAS_GASTO = [
  'Comida/Restaurantes', 'Gasolina/Carro', 'Supermercado', 'Gym/Deporte',
  'Suscripciones', 'Telecom', 'Parqueo', 'Ropa/Personal', 'Entretenimiento',
  'Familia/Regalos', 'Iglesia/Donaciones', 'Suplementos', 'Transporte',
  'Pago Deudas', 'Otros',
]

export const CATEGORIAS_INGRESO = ['Ingreso', 'Familia/Regalos', 'Otros']

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

export const mesActual = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const TIPOS_INVERSION = [
  { value: 'fondo',     label: 'Fondo de inversión' },
  { value: 'acciones',  label: 'Acciones / ETF' },
  { value: 'cdp',       label: 'CDP / Depósito a plazo' },
  { value: 'crypto',    label: 'Criptomonedas' },
  { value: 'inmueble',  label: 'Inmueble / Bien raíz' },
  { value: 'otro',      label: 'Otro' },
] as const
