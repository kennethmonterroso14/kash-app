/**
 * Las herramientas que el conector MCP le ofrece a la IA de la persona.
 *
 * Todas corren con el cliente de Supabase AUTENTICADO COMO ESA PERSONA (su
 * token OAuth), nunca con la service role: RLS es la frontera, igual que en la
 * app. Las reglas de la app valen acá sin excepción — `cuentas.saldo` no se
 * escribe (todo es una fila de `transacciones` y el trigger hace el resto), el
 * dinero es centavos enteros y las fechas son las de la zona del perfil.
 *
 * Editar y borrar existen pero están APAGADOS por defecto: la persona los
 * activa en Ajustes → Asistentes de IA (`profiles.ia_puede_editar`). La base
 * lo hace cumplir con policies restrictivas (schema.sql, sección 4b) aunque
 * alguien se salte este archivo; el chequeo de acá existe para dar un mensaje
 * que diga cómo activarlo, en vez de un "cero filas". Las tarjetas de crédito
 * quedan fuera (docs/superpowers/specs/2026-09-24-mcp-asistentes-design.md).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  calcAjusteParaSaldo, calcEstadisticasMes, formatMoneda, type OpcionesMoneda, type Transaccion,
} from '../../src/lib/finanzas.js'
import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO, hoyEn, zonaValida } from '../../src/lib/constants.js'
import { crearCuentaConSaldoEn } from '../../src/lib/altaCuentaEn.js'
import { decidirBajaCuenta } from '../../src/lib/bajaCuenta.js'
import { paletaDatos } from '../../src/lib/tokens.js'
import {
  ErrorHerramienta, leerFecha, leerMes, leerMonto, leerSaldo, leerTexto, leerTextoOpcional,
  rangoMes, separarDuplicados,
} from './validacion.js'

export interface Contexto {
  db: SupabaseClient
  userId: string
}

export interface Herramienta {
  nombre: string
  titulo: string
  descripcion: string
  esquema: Record<string, unknown>
  /** Solo lee: el cliente puede llamarla sin pedir confirmación. */
  soloLectura: boolean
  /** Borra algo: el cliente debería confirmarlo con la persona antes. */
  destructiva?: boolean
  ejecutar(ctx: Contexto, args: Record<string, unknown>): Promise<unknown>
}

const TIPOS_CUENTA = ['ahorro', 'corriente', 'efectivo', 'inversion', 'otro'] as const
const MAX_MOVIMIENTOS = 100
const MAX_LISTADO = 1000

/** Un fallo de la base: se registra entero en los logs y la IA recibe algo legible. */
function fallo(accion: string, error: { message: string } | null): never {
  console.error(`[mcp] ${accion}:`, error?.message)
  throw new ErrorHerramienta(`No se pudo ${accion}. Intenta de nuevo en un momento.`)
}

// ─── LECTURAS COMPARTIDAS ─────────────────────────────────────────────

interface Perfil extends OpcionesMoneda {
  nombre: string
  zona: string
  hoy: string
}

async function cargarPerfil({ db, userId }: Contexto): Promise<Perfil> {
  const { data, error } = await db
    .from('profiles').select('nombre, moneda, locale, zona_horaria').eq('user_id', userId).maybeSingle()
  if (error) fallo('leer tu perfil', error)
  if (!data) throw new ErrorHerramienta('Tu cuenta de Vorta todavía no está configurada: abre la app una vez para terminar el registro.')
  // Una zona inválida no se adivina: fecharía mal lo que se escriba.
  if (!zonaValida(data.zona_horaria)) {
    throw new ErrorHerramienta('La zona horaria de tu perfil no es válida. Corrígela en Vorta → Ajustes → Editar perfil.')
  }
  return {
    nombre: data.nombre, moneda: data.moneda, locale: data.locale,
    zona: data.zona_horaria, hoy: hoyEn(data.zona_horaria),
  }
}

interface CuentaFila { id: string; nombre: string; tipo: string; saldo: number }

async function cargarCuentas({ db, userId }: Contexto): Promise<CuentaFila[]> {
  const { data, error } = await db
    .from('cuentas').select('id, nombre, tipo, saldo')
    .eq('user_id', userId).eq('activa', true).order('created_at', { ascending: true })
  if (error) fallo('leer tus cuentas', error)
  return data ?? []
}

/** Base + las propias, como `useCategorias`. */
async function cargarCategorias({ db, userId }: Contexto): Promise<{ gasto: string[]; ingreso: string[] }> {
  const { data, error } = await db.from('categorias_usuario').select('nombre, tipo').eq('user_id', userId)
  if (error) fallo('leer tus categorías', error)
  const propias = data ?? []
  const de = (tipo: string) => propias.filter(c => c.tipo === tipo || c.tipo === 'ambos').map(c => c.nombre)
  return {
    gasto: [...new Set([...CATEGORIAS_GASTO, ...de('gasto')])],
    ingreso: [...new Set([...CATEGORIAS_INGRESO, ...de('ingreso')])],
  }
}

const unidades = (centavos: number) => centavos / 100

function cuentaPorId(cuentas: CuentaFila[], id: unknown, campo: string): CuentaFila {
  const c = typeof id === 'string' ? cuentas.find(x => x.id === id) : undefined
  if (!c) {
    throw new ErrorHerramienta(`${campo}: no es una de tus cuentas activas. Usa un id de obtener_contexto.`)
  }
  return c
}

async function saldosDe(ctx: Contexto, ids: string[], fmt: (c: number) => string) {
  const { data, error } = await ctx.db
    .from('cuentas').select('id, nombre, saldo').eq('user_id', ctx.userId).in('id', ids)
  if (error) return undefined   // lo escrito ya está escrito: no se convierte en error
  return (data ?? []).map(c => ({ id: c.id, nombre: c.nombre, saldo: unidades(c.saldo), saldo_texto: fmt(c.saldo) }))
}

// ─── HERRAMIENTAS ─────────────────────────────────────────────────────

const obtenerContexto: Herramienta = {
  nombre: 'obtener_contexto',
  titulo: 'Ver cuentas y categorías',
  descripcion:
    'Devuelve el perfil (moneda, zona horaria y la fecha de hoy), las cuentas activas con su saldo e id, ' +
    'y las categorías válidas de gasto e ingreso. Llámala primero: las demás herramientas piden ids de cuenta ' +
    'y categorías de esta lista.',
  esquema: { type: 'object', properties: {}, additionalProperties: false },
  soloLectura: true,
  async ejecutar(ctx) {
    const [perfil, cuentas, categorias] = await Promise.all([cargarPerfil(ctx), cargarCuentas(ctx), cargarCategorias(ctx)])
    const fmt = (c: number) => formatMoneda(c, perfil)
    return {
      perfil: {
        nombre: perfil.nombre, moneda: perfil.moneda, zona_horaria: perfil.zona,
        hoy: perfil.hoy, mes_actual: perfil.hoy.slice(0, 7),
      },
      cuentas: cuentas.map(c => ({
        id: c.id, nombre: c.nombre, tipo: c.tipo, saldo: unidades(c.saldo), saldo_texto: fmt(c.saldo),
      })),
      categorias,
      notas: 'Los montos van en unidades de la moneda del perfil (125.50), siempre positivos: el tipo decide el signo.',
    }
  },
}

async function movimientosDelMes(ctx: Contexto, mes: string, cuentaId?: string) {
  const { desde, hasta } = rangoMes(mes)
  let q = ctx.db
    .from('transacciones')
    .select('id, fecha, cantidad, descripcion, categoria, tipo, cuenta_id, tarjeta_id')
    .eq('user_id', ctx.userId).gte('fecha', desde).lte('fecha', hasta)
  if (cuentaId) q = q.eq('cuenta_id', cuentaId)
  const { data, error } = await q
    .order('fecha', { ascending: false }).order('created_at', { ascending: false })
    .limit(MAX_LISTADO + 1)
  if (error) fallo('leer tus movimientos', error)
  return data ?? []
}

const listarMovimientos: Herramienta = {
  nombre: 'listar_movimientos',
  titulo: 'Ver movimientos del mes',
  descripcion:
    'Lista los movimientos de un mes (el estado mensual): fecha, tipo, monto con signo (negativo = sale dinero), ' +
    'categoría, descripción y cuenta o tarjeta. Tipos: ingreso, gasto, ajuste (saldos iniciales, correcciones y ' +
    'transferencias), gasto_tc (compra con tarjeta de crédito) y pago_tc (pago de tarjeta).',
  esquema: {
    type: 'object',
    properties: {
      mes: { type: 'string', description: 'YYYY-MM. Por defecto, el mes actual.' },
      cuenta_id: { type: 'string', description: 'Solo los de esta cuenta (id de obtener_contexto).' },
    },
    additionalProperties: false,
  },
  soloLectura: true,
  async ejecutar(ctx, args) {
    const perfil = await cargarPerfil(ctx)
    const mes = leerMes(args.mes, perfil.hoy.slice(0, 7))
    const cuentaId = leerTextoOpcional(args.cuenta_id, 'cuenta_id', 64)

    const [filas, nombresCuentas, nombresTarjetas] = await Promise.all([
      movimientosDelMes(ctx, mes, cuentaId),
      // Incluye las archivadas: un movimiento viejo puede ser de una.
      ctx.db.from('cuentas').select('id, nombre').eq('user_id', ctx.userId),
      ctx.db.from('tarjetas_credito').select('id, nombre').eq('user_id', ctx.userId),
    ])
    const cuentas = new Map((nombresCuentas.data ?? []).map(c => [c.id, c.nombre]))
    const tarjetas = new Map((nombresTarjetas.data ?? []).map(t => [t.id, t.nombre]))
    const fmt = (c: number) => formatMoneda(c, perfil)

    const recortado = filas.length > MAX_LISTADO
    return {
      mes,
      cantidad: Math.min(filas.length, MAX_LISTADO),
      ...(recortado && { aviso: `Se muestran los ${MAX_LISTADO} más recientes; filtra por cuenta para ver el resto.` }),
      movimientos: filas.slice(0, MAX_LISTADO).map(t => ({
        id: t.id,
        fecha: t.fecha,
        tipo: t.tipo,
        monto: unidades(t.cantidad),
        monto_texto: fmt(t.cantidad),
        categoria: t.categoria,
        descripcion: t.descripcion,
        ...(t.cuenta_id && { cuenta: cuentas.get(t.cuenta_id) ?? t.cuenta_id }),
        ...(t.tarjeta_id && { tarjeta: tarjetas.get(t.tarjeta_id) ?? t.tarjeta_id }),
      })),
    }
  },
}

const resumenMes: Herramienta = {
  nombre: 'resumen_mes',
  titulo: 'Resumen del mes',
  descripcion:
    'Ingresos, gastos, neto, porcentaje de ahorro y gasto por categoría de un mes, con los mismos criterios que ' +
    'la app: las compras con tarjeta cuentan como gasto y los pagos de tarjeta no (moverían la deuda dos veces).',
  esquema: {
    type: 'object',
    properties: { mes: { type: 'string', description: 'YYYY-MM. Por defecto, el mes actual.' } },
    additionalProperties: false,
  },
  soloLectura: true,
  async ejecutar(ctx, args) {
    const perfil = await cargarPerfil(ctx)
    const mes = leerMes(args.mes, perfil.hoy.slice(0, 7))
    // Sin el tope del listado: un resumen con filas de menos mentiría.
    const { desde, hasta } = rangoMes(mes)
    const { data, error } = await ctx.db
      .from('transacciones').select('id, fecha, cantidad, descripcion, categoria, tipo')
      .eq('user_id', ctx.userId).gte('fecha', desde).lte('fecha', hasta)
    if (error) fallo('leer tus movimientos', error)
    const txns = (data ?? []) as Transaccion[]
    const e = calcEstadisticasMes(txns)
    const fmt = (c: number) => formatMoneda(c, perfil)
    const porCategoria = Object.entries(e.porCategoria)
      .sort((a, b) => b[1] - a[1])
      .map(([categoria, c]) => ({
        categoria, monto: unidades(c), monto_texto: fmt(c),
        porcentaje: e.gastos > 0 ? Math.round((c / e.gastos) * 100) : 0,
      }))
    return {
      mes,
      movimientos: txns.length,
      ingresos: unidades(e.ingresos), ingresos_texto: fmt(e.ingresos),
      gastos: unidades(e.gastos), gastos_texto: fmt(e.gastos),
      neto: unidades(e.neto), neto_texto: fmt(e.neto),
      porcentaje_ahorro: e.pctAhorro,
      gastos_por_categoria: porCategoria,
    }
  },
}

const registrarMovimientos: Herramienta = {
  nombre: 'registrar_movimientos',
  titulo: 'Registrar movimientos',
  descripcion:
    `Registra de 1 a ${MAX_MOVIMIENTOS} ingresos o gastos en cuentas (no tarjetas de crédito), por ejemplo los de ` +
    'un estado de cuenta. Es todo o nada: si una fila es inválida no se registra ninguna y la respuesta dice qué ' +
    'corregir. Por defecto omite los que ya están registrados (misma cuenta, fecha, monto y descripción), así que ' +
    'importar el mismo estado dos veces no duplica. Cada movimiento mueve el saldo de su cuenta.',
  esquema: {
    type: 'object',
    properties: {
      movimientos: {
        type: 'array', minItems: 1, maxItems: MAX_MOVIMIENTOS,
        items: {
          type: 'object',
          properties: {
            cuenta_id: { type: 'string', description: 'Id de la cuenta (de obtener_contexto).' },
            tipo: { type: 'string', enum: ['gasto', 'ingreso'] },
            monto: { type: 'number', exclusiveMinimum: 0, description: 'En unidades, positivo: 125.50' },
            descripcion: { type: 'string', maxLength: 200 },
            fecha: { type: 'string', description: 'YYYY-MM-DD. Por defecto, hoy. No puede ser futura.' },
            categoria: { type: 'string', description: 'Una de obtener_contexto para ese tipo. Por defecto, "Otros".' },
            notas: { type: 'string', maxLength: 500 },
          },
          required: ['cuenta_id', 'tipo', 'monto', 'descripcion'],
          additionalProperties: false,
        },
      },
      omitir_duplicados: { type: 'boolean', description: 'Por defecto true.' },
    },
    required: ['movimientos'],
    additionalProperties: false,
  },
  soloLectura: false,
  async ejecutar(ctx, args) {
    const lista = args.movimientos
    if (!Array.isArray(lista) || lista.length === 0) {
      throw new ErrorHerramienta('movimientos: manda una lista con al menos un movimiento')
    }
    if (lista.length > MAX_MOVIMIENTOS) {
      throw new ErrorHerramienta(`movimientos: máximo ${MAX_MOVIMIENTOS} por llamada; parte el estado en varias`)
    }
    const [perfil, cuentas, categorias] = await Promise.all([cargarPerfil(ctx), cargarCuentas(ctx), cargarCategorias(ctx)])

    const errores: string[] = []
    // La posición en el lote de cada fila, para decir cuáles se omitieron sin
    // meter un campo que no es columna en lo que se inserta.
    const indiceDe = new Map<object, number>()
    const filas = lista.flatMap((m: unknown, i: number) => {
      const campo = (c: string) => `movimientos[${i}].${c}`
      try {
        if (typeof m !== 'object' || m === null) throw new ErrorHerramienta(`movimientos[${i}]: debe ser un objeto`)
        const r = m as Record<string, unknown>
        if (r.tipo !== 'gasto' && r.tipo !== 'ingreso') {
          throw new ErrorHerramienta(`${campo('tipo')}: "gasto" o "ingreso"`)
        }
        const tipo = r.tipo
        const cuenta = cuentaPorId(cuentas, r.cuenta_id, campo('cuenta_id'))
        const centavos = leerMonto(r.monto, campo('monto'))
        const validas = tipo === 'gasto' ? categorias.gasto : categorias.ingreso
        const categoria = r.categoria === undefined || r.categoria === '' ? 'Otros' : r.categoria
        if (typeof categoria !== 'string' || !validas.includes(categoria)) {
          throw new ErrorHerramienta(`${campo('categoria')}: "${String(categoria)}" no es una categoría de ${tipo}`)
        }
        const notas = leerTextoOpcional(r.notas, campo('notas'), 500)
        const fila = {
          user_id: ctx.userId,
          cuenta_id: cuenta.id,
          tipo,
          // El signo lo pone el tipo, como en la app: la base exige gasto < 0.
          cantidad: tipo === 'gasto' ? -centavos : centavos,
          descripcion: leerTexto(r.descripcion, campo('descripcion'), 200),
          fecha: leerFecha(r.fecha, perfil.hoy, campo('fecha')),
          categoria,
          ...(notas && { notas }),
        }
        indiceDe.set(fila, i)
        return [fila]
      } catch (e) {
        if (!(e instanceof ErrorHerramienta)) throw e
        errores.push(e.message)
        return []
      }
    })
    if (errores.length > 0) {
      const extra = errores.length > 20 ? `\n… y ${errores.length - 20} más.` : ''
      throw new ErrorHerramienta(
        `No se registró nada. Corrige y vuelve a mandar el lote completo:\n- ${errores.slice(0, 20).join('\n- ')}${extra}` +
        `\nCategorías de gasto: ${categorias.gasto.join(', ')}.\nCategorías de ingreso: ${categorias.ingreso.join(', ')}.`,
      )
    }

    let insertar = filas
    let duplicados: typeof filas = []
    if (args.omitir_duplicados !== false) {
      const fechas = filas.map(f => f.fecha).sort()
      const { data, error } = await ctx.db
        .from('transacciones').select('cuenta_id, fecha, cantidad, descripcion')
        .eq('user_id', ctx.userId)
        .in('cuenta_id', [...new Set(filas.map(f => f.cuenta_id))])
        .gte('fecha', fechas[0]).lte('fecha', fechas[fechas.length - 1])
      // Sin poder comparar, no se inserta: duplicar un estado entero es peor que reintentar.
      if (error) fallo('revisar si ya estaban registrados', error)
      ;({ insertar, duplicados } = separarDuplicados(filas, data ?? []))
    }

    if (insertar.length > 0) {
      // Un solo insert: la base lo aplica entero o nada.
      const { error } = await ctx.db.from('transacciones').insert(insertar)
      if (error) fallo('registrar los movimientos (no se registró ninguno)', error)
    }

    const fmt = (c: number) => formatMoneda(c, perfil)
    return {
      registrados: insertar.length,
      omitidos_por_duplicado: duplicados.map(d => ({
        indice: indiceDe.get(d), fecha: d.fecha, descripcion: d.descripcion, monto: unidades(Math.abs(d.cantidad)),
      })),
      saldos: insertar.length > 0 ? await saldosDe(ctx, [...new Set(insertar.map(f => f.cuenta_id))], fmt) : undefined,
    }
  },
}

const transferir: Herramienta = {
  nombre: 'transferir',
  titulo: 'Transferir entre cuentas',
  descripcion:
    'Pasa dinero de una cuenta propia a otra. No es ingreso ni gasto: se registra como las transferencias de la ' +
    'app (dos ajustes con categoría Transferencia), así que no cambia el resumen del mes.',
  esquema: {
    type: 'object',
    properties: {
      desde_cuenta_id: { type: 'string' },
      hacia_cuenta_id: { type: 'string' },
      monto: { type: 'number', exclusiveMinimum: 0 },
      fecha: { type: 'string', description: 'YYYY-MM-DD. Por defecto, hoy.' },
      descripcion: { type: 'string', maxLength: 200 },
    },
    required: ['desde_cuenta_id', 'hacia_cuenta_id', 'monto'],
    additionalProperties: false,
  },
  soloLectura: false,
  async ejecutar(ctx, args) {
    const [perfil, cuentas] = await Promise.all([cargarPerfil(ctx), cargarCuentas(ctx)])
    const desde = cuentaPorId(cuentas, args.desde_cuenta_id, 'desde_cuenta_id')
    const hacia = cuentaPorId(cuentas, args.hacia_cuenta_id, 'hacia_cuenta_id')
    if (desde.id === hacia.id) throw new ErrorHerramienta('Las dos cuentas son la misma')
    const centavos = leerMonto(args.monto)
    const fecha = leerFecha(args.fecha, perfil.hoy)
    const descripcion = leerTextoOpcional(args.descripcion, 'descripcion', 200) ?? 'Transferencia'

    const base = { user_id: ctx.userId, categoria: 'Transferencia', tipo: 'ajuste' as const, descripcion, fecha }
    const { error } = await ctx.db.from('transacciones').insert([
      { ...base, cuenta_id: desde.id, cantidad: -centavos },
      { ...base, cuenta_id: hacia.id, cantidad: centavos },
    ])
    if (error) fallo('registrar la transferencia (no se movió nada)', error)
    const fmt = (c: number) => formatMoneda(c, perfil)
    return { transferido: unidades(centavos), transferido_texto: fmt(centavos), saldos: await saldosDe(ctx, [desde.id, hacia.id], fmt) }
  },
}

const crearCuenta: Herramienta = {
  nombre: 'crear_cuenta',
  titulo: 'Crear cuenta',
  descripcion:
    'Crea una cuenta (banco, efectivo…) con su saldo inicial. No crea tarjetas de crédito. Si ya hay una cuenta ' +
    'activa con ese nombre, no crea otra.',
  esquema: {
    type: 'object',
    properties: {
      nombre: { type: 'string', maxLength: 60 },
      tipo: { type: 'string', enum: [...TIPOS_CUENTA], description: 'Por defecto, ahorro.' },
      saldo_inicial: { type: 'number', minimum: 0, description: 'En unidades. Por defecto, 0.' },
    },
    required: ['nombre'],
    additionalProperties: false,
  },
  soloLectura: false,
  async ejecutar(ctx, args) {
    const [perfil, cuentas] = await Promise.all([cargarPerfil(ctx), cargarCuentas(ctx)])
    const nombre = leerTexto(args.nombre, 'nombre', 60)
    const tipo = args.tipo ?? 'ahorro'
    if (typeof tipo !== 'string' || !(TIPOS_CUENTA as readonly string[]).includes(tipo)) {
      throw new ErrorHerramienta(`tipo: uno de ${TIPOS_CUENTA.join(', ')}`)
    }
    // Una IA que reintenta no debe dejar dos "BI Ahorros".
    const igual = cuentas.find(c => c.nombre.trim().toLowerCase() === nombre.toLowerCase())
    if (igual) {
      throw new ErrorHerramienta(`Ya tienes una cuenta "${igual.nombre}" (id ${igual.id}). Usa esa, o elige otro nombre.`)
    }
    const saldo = args.saldo_inicial === undefined || args.saldo_inicial === 0 ? 0 : leerMonto(args.saldo_inicial, 'saldo_inicial')

    const error = await crearCuentaConSaldoEn(ctx.db, {
      userId: ctx.userId, nombre, tipo, saldoCentavos: saldo, hoy: perfil.hoy,
      color: paletaDatos[cuentas.length % paletaDatos.length],
    })
    if (error) {
      // El único mensaje que sirve tal cual es el de la compensación fallida:
      // dice qué quedó a medias. El resto es texto de Postgres.
      if (error.includes('quedó creada')) throw new ErrorHerramienta(error)
      fallo('crear la cuenta', { message: error })
    }
    const { data } = await ctx.db
      .from('cuentas').select('id, nombre, tipo, saldo')
      .eq('user_id', ctx.userId).eq('nombre', nombre).eq('activa', true)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    const fmt = (c: number) => formatMoneda(c, perfil)
    return {
      creada: true,
      cuenta: data
        ? { id: data.id, nombre: data.nombre, tipo: data.tipo, saldo: unidades(data.saldo), saldo_texto: fmt(data.saldo) }
        : { nombre, tipo, saldo: unidades(saldo) },
    }
  },
}

const fijarSaldo: Herramienta = {
  nombre: 'fijar_saldo_cuenta',
  titulo: 'Poner el saldo real de una cuenta',
  descripcion:
    'Deja una cuenta en el saldo que se indique — por ejemplo el saldo final de un estado de cuenta — registrando ' +
    'la diferencia como un ajuste, igual que "Cambiar saldo" en la app. Úsala después de registrar los movimientos, ' +
    'para cuadrar lo que falte.',
  esquema: {
    type: 'object',
    properties: {
      cuenta_id: { type: 'string' },
      saldo: { type: 'number', description: 'El saldo real, en unidades. Puede ser 0 o negativo.' },
      fecha: { type: 'string', description: 'YYYY-MM-DD del ajuste. Por defecto, hoy.' },
    },
    required: ['cuenta_id', 'saldo'],
    additionalProperties: false,
  },
  soloLectura: false,
  async ejecutar(ctx, args) {
    const [perfil, cuentas] = await Promise.all([cargarPerfil(ctx), cargarCuentas(ctx)])
    const cuenta = cuentaPorId(cuentas, args.cuenta_id, 'cuenta_id')
    const nuevo = leerSaldo(args.saldo)
    const fecha = leerFecha(args.fecha, perfil.hoy)
    const fmt = (c: number) => formatMoneda(c, perfil)

    // Contra el saldo de la base en este momento, no el que la IA vio antes.
    const { data: fila, error: errLeer } = await ctx.db
      .from('cuentas').select('saldo').eq('id', cuenta.id).eq('user_id', ctx.userId).single()
    if (errLeer || !fila) fallo('leer el saldo actual', errLeer)
    const delta = calcAjusteParaSaldo(fila.saldo, nuevo)
    if (delta === 0) return { sin_cambios: true, saldo: unidades(nuevo), saldo_texto: fmt(nuevo) }

    const { error } = await ctx.db.from('transacciones').insert({
      user_id: ctx.userId, cuenta_id: cuenta.id, fecha, cantidad: delta,
      descripcion: `Saldo actualizado a ${fmt(nuevo)} — ${cuenta.nombre}`.slice(0, 200),
      categoria: 'Ajuste de cuenta', tipo: 'ajuste',
    })
    if (error) fallo('guardar el saldo', error)
    return {
      saldo_anterior: unidades(fila.saldo), saldo_nuevo: unidades(nuevo), saldo_nuevo_texto: fmt(nuevo),
      ajuste: unidades(delta), ajuste_texto: fmt(delta),
    }
  },
}

// ─── EDITAR Y BORRAR (solo con el permiso de la persona) ──────────────

const COMO_ACTIVAR =
  'Editar y borrar desde un asistente está desactivado. La persona puede activarlo en Vorta → Ajustes → ' +
  'Asistentes de IA → "Permitir editar y borrar", o hacer el cambio directamente en la app.'

async function exigirPermisoModificar({ db, userId }: Contexto): Promise<void> {
  const { data, error } = await db.from('profiles').select('ia_puede_editar').eq('user_id', userId).maybeSingle()
  // Sin la migración la columna no existe: para este asistente es "apagado".
  if (error && /ia_puede_editar/.test(error.message)) throw new ErrorHerramienta(COMO_ACTIVAR)
  if (error) fallo('leer tus permisos', error)
  if (!data?.ia_puede_editar) throw new ErrorHerramienta(COMO_ACTIVAR)
}

/**
 * RLS no da error cuando una policy restrictiva rechaza: la fila simplemente
 * no se toca. Si el permiso se apagó entre el chequeo y la escritura, se ve así.
 */
function sinFilas(accion: string): never {
  throw new ErrorHerramienta(`No se pudo ${accion}: no se encontró, o el permiso para editar y borrar se desactivó. ${COMO_ACTIVAR}`)
}

const TIPOS_TC = ['gasto_tc', 'pago_tc']
const NOTA_PERMISO = ' Requiere que la persona haya activado "Permitir editar y borrar" en Vorta → Ajustes → Asistentes de IA.'

const editarMovimiento: Herramienta = {
  nombre: 'editar_movimiento',
  titulo: 'Editar un movimiento',
  descripcion:
    'Corrige un movimiento: descripción, fecha, notas y, en ingresos y gastos, también monto y categoría (el ' +
    'saldo de la cuenta se ajusta solo). Los de tarjeta de crédito no se editan: se corrigen en la app. Usa ' +
    'el id de listar_movimientos.' + NOTA_PERMISO,
  esquema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      descripcion: { type: 'string', maxLength: 200 },
      fecha: { type: 'string', description: 'YYYY-MM-DD, no futura.' },
      monto: { type: 'number', exclusiveMinimum: 0, description: 'En unidades, positivo. Solo ingresos y gastos.' },
      categoria: { type: 'string', description: 'Solo ingresos y gastos.' },
      notas: { type: 'string', maxLength: 500 },
    },
    required: ['id'],
    additionalProperties: false,
  },
  soloLectura: false,
  async ejecutar(ctx, args) {
    await exigirPermisoModificar(ctx)
    const [perfil, categorias] = await Promise.all([cargarPerfil(ctx), cargarCategorias(ctx)])
    const id = leerTexto(args.id, 'id', 64)
    const { data: t, error } = await ctx.db
      .from('transacciones').select('id, tipo, cantidad, categoria, cuenta_id')
      .eq('id', id).eq('user_id', ctx.userId).maybeSingle()
    if (error) fallo('leer el movimiento', error)
    if (!t) throw new ErrorHerramienta('id: no es uno de tus movimientos')
    if (TIPOS_TC.includes(t.tipo)) {
      throw new ErrorHerramienta('Los movimientos de tarjeta de crédito no se editan: bórralo y regístralo de nuevo desde Tarjetas en la app.')
    }
    const esFlujo = t.tipo === 'ingreso' || t.tipo === 'gasto'
    if (!esFlujo && (args.monto !== undefined || args.categoria !== undefined)) {
      throw new ErrorHerramienta('En ajustes y transferencias solo se corrigen descripción, fecha y notas. Para el saldo, usa fijar_saldo_cuenta.')
    }

    const cambios: Record<string, unknown> = {}
    if (args.descripcion !== undefined) cambios.descripcion = leerTexto(args.descripcion, 'descripcion', 200)
    if (args.fecha !== undefined) cambios.fecha = leerFecha(args.fecha, perfil.hoy)
    if (args.notas !== undefined) cambios.notas = leerTextoOpcional(args.notas, 'notas', 500) ?? null
    if (args.monto !== undefined) {
      const c = leerMonto(args.monto)
      cambios.cantidad = t.tipo === 'gasto' ? -c : c
    }
    if (args.categoria !== undefined) {
      const validas = t.tipo === 'gasto' ? categorias.gasto : categorias.ingreso
      if (typeof args.categoria !== 'string' || !validas.includes(args.categoria)) {
        throw new ErrorHerramienta(`categoria: "${String(args.categoria)}" no es una categoría de ${t.tipo}. Válidas: ${validas.join(', ')}.`)
      }
      cambios.categoria = args.categoria
    }
    if (Object.keys(cambios).length === 0) throw new ErrorHerramienta('No indicaste nada que cambiar')

    const { data: editadas, error: errEditar } = await ctx.db
      .from('transacciones').update(cambios).eq('id', id).eq('user_id', ctx.userId).select('id')
    if (errEditar) fallo('editar el movimiento', errEditar)
    if (!editadas?.length) sinFilas('editar el movimiento')
    const fmt = (c: number) => formatMoneda(c, perfil)
    return { editado: true, cambios: Object.keys(cambios), saldos: t.cuenta_id ? await saldosDe(ctx, [t.cuenta_id], fmt) : undefined }
  },
}

const borrarMovimientos: Herramienta = {
  nombre: 'borrar_movimientos',
  titulo: 'Borrar movimientos',
  descripcion:
    'Borra de 1 a 50 movimientos por id (de listar_movimientos), todos o ninguno; el saldo de cada cuenta se ' +
    'revierte solo. Una transferencia son DOS movimientos (tipo ajuste, categoría Transferencia): borra los dos. ' +
    'Los de tarjeta de crédito se borran desde la app. Confirma con la persona antes: no se puede deshacer ' +
    'desde aquí.' + NOTA_PERMISO,
  esquema: {
    type: 'object',
    properties: { ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 50 } },
    required: ['ids'],
    additionalProperties: false,
  },
  soloLectura: false,
  destructiva: true,
  async ejecutar(ctx, args) {
    await exigirPermisoModificar(ctx)
    const ids = args.ids
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50 || !ids.every(i => typeof i === 'string')) {
      throw new ErrorHerramienta('ids: manda de 1 a 50 ids de movimientos')
    }
    const unicos = [...new Set(ids as string[])]
    const { data: filas, error } = await ctx.db
      .from('transacciones').select('id, tipo, cuenta_id, descripcion')
      .eq('user_id', ctx.userId).in('id', unicos)
    if (error) fallo('leer los movimientos', error)
    const encontrados = new Set((filas ?? []).map(f => f.id))
    const faltan = unicos.filter(i => !encontrados.has(i))
    if (faltan.length) throw new ErrorHerramienta(`No se borró nada. Estos ids no son movimientos tuyos: ${faltan.join(', ')}`)
    const deTarjeta = (filas ?? []).filter(f => TIPOS_TC.includes(f.tipo))
    if (deTarjeta.length) {
      throw new ErrorHerramienta(`No se borró nada. Los de tarjeta de crédito se borran desde Tarjetas en la app: ${deTarjeta.map(f => f.id).join(', ')}`)
    }

    // Un solo delete: la base lo aplica entero o nada.
    const { data: borradas, error: errBorrar } = await ctx.db
      .from('transacciones').delete().eq('user_id', ctx.userId).in('id', unicos).select('id')
    if (errBorrar) fallo('borrar los movimientos (no se borró ninguno)', errBorrar)
    if ((borradas?.length ?? 0) !== unicos.length) sinFilas('borrar todos los movimientos')
    const perfil = await cargarPerfil(ctx)
    const fmt = (c: number) => formatMoneda(c, perfil)
    const cuentas = [...new Set((filas ?? []).map(f => f.cuenta_id).filter((c): c is string => !!c))]
    return { borrados: unicos.length, saldos: cuentas.length ? await saldosDe(ctx, cuentas, fmt) : undefined }
  },
}

const editarCuenta: Herramienta = {
  nombre: 'editar_cuenta',
  titulo: 'Editar una cuenta',
  descripcion:
    'Cambia el nombre o el tipo de una cuenta. El saldo no se edita aquí: usa fijar_saldo_cuenta.' + NOTA_PERMISO,
  esquema: {
    type: 'object',
    properties: {
      cuenta_id: { type: 'string' },
      nombre: { type: 'string', maxLength: 60 },
      tipo: { type: 'string', enum: [...TIPOS_CUENTA] },
    },
    required: ['cuenta_id'],
    additionalProperties: false,
  },
  soloLectura: false,
  async ejecutar(ctx, args) {
    await exigirPermisoModificar(ctx)
    const cuentas = await cargarCuentas(ctx)
    const cuenta = cuentaPorId(cuentas, args.cuenta_id, 'cuenta_id')
    const cambios: Record<string, unknown> = {}
    if (args.nombre !== undefined) {
      const nombre = leerTexto(args.nombre, 'nombre', 60)
      const igual = cuentas.find(c => c.id !== cuenta.id && c.nombre.trim().toLowerCase() === nombre.toLowerCase())
      if (igual) throw new ErrorHerramienta(`Ya tienes otra cuenta "${igual.nombre}". Elige otro nombre.`)
      cambios.nombre = nombre
    }
    if (args.tipo !== undefined) {
      if (typeof args.tipo !== 'string' || !(TIPOS_CUENTA as readonly string[]).includes(args.tipo)) {
        throw new ErrorHerramienta(`tipo: uno de ${TIPOS_CUENTA.join(', ')}`)
      }
      cambios.tipo = args.tipo
    }
    if (Object.keys(cambios).length === 0) throw new ErrorHerramienta('No indicaste nada que cambiar')
    const { data, error } = await ctx.db
      .from('cuentas').update(cambios).eq('id', cuenta.id).eq('user_id', ctx.userId).select('id, nombre, tipo')
    if (error) fallo('editar la cuenta', error)
    if (!data?.length) sinFilas('editar la cuenta')
    return { editada: true, cuenta: data[0] }
  },
}

const eliminarCuenta: Herramienta = {
  nombre: 'eliminar_cuenta',
  titulo: 'Eliminar una cuenta',
  descripcion:
    'Elimina una cuenta con las mismas reglas que la app: si tiene saldo o pagos fijos activos no se puede ' +
    '(primero transfiere el saldo o déjala en 0 con fijar_saldo_cuenta); si tiene movimientos se archiva ' +
    '(deja de verse y su historial se conserva); si está vacía se borra. Confirma con la persona antes.' + NOTA_PERMISO,
  esquema: {
    type: 'object',
    properties: { cuenta_id: { type: 'string' } },
    required: ['cuenta_id'],
    additionalProperties: false,
  },
  soloLectura: false,
  destructiva: true,
  async ejecutar(ctx, args) {
    await exigirPermisoModificar(ctx)
    const [perfil, cuentas] = await Promise.all([cargarPerfil(ctx), cargarCuentas(ctx)])
    const cuenta = cuentaPorId(cuentas, args.cuenta_id, 'cuenta_id')
    const { db, userId } = ctx
    const contar = (tabla: string, extra?: [string, unknown]) => {
      let q = db.from(tabla).select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('cuenta_id', cuenta.id)
      if (extra) q = q.eq(extra[0], extra[1])
      return q
    }
    const [fila, movs, pagos, pagosActivos] = await Promise.all([
      db.from('cuentas').select('saldo').eq('id', cuenta.id).eq('user_id', userId).single(),
      contar('transacciones'),
      contar('pagos_recurrentes'),
      contar('pagos_recurrentes', ['activo', true]),
    ])
    if (fila.error || movs.error || pagos.error || pagosActivos.error) {
      fallo('revisar la cuenta', fila.error ?? movs.error ?? pagos.error ?? pagosActivos.error)
    }
    // La regla es la de la app (`lib/bajaCuenta.ts`), no una copia.
    const decision = decidirBajaCuenta({
      saldo: fila.data.saldo,
      movimientos: movs.count ?? 0,
      pagosFijos: pagos.count ?? 0,
      pagosFijosActivos: pagosActivos.count ?? 0,
    })
    if (decision.accion === 'bloquear') {
      throw new ErrorHerramienta(decision.motivo === 'saldo'
        ? `No se eliminó: la cuenta tiene ${formatMoneda(fila.data.saldo, perfil)}. Transfiere ese saldo a otra cuenta o déjala en 0 con fijar_saldo_cuenta, y vuelve a intentarlo.`
        : 'No se eliminó: la cuenta tiene pagos fijos activos. Cámbialos a otra cuenta o elimínalos en la app (Ajustes → Pagos fijos).')
    }
    let hecho: 'borrada' | 'archivada' = decision.accion === 'borrar' ? 'borrada' : 'archivada'
    if (hecho === 'borrada') {
      const { data, error } = await db.from('cuentas').delete().eq('id', cuenta.id).eq('user_id', userId).select('id')
      // 23503: apareció un movimiento entre el conteo y el borrado → se archiva.
      if (error && (error as { code?: string }).code !== '23503') fallo('eliminar la cuenta', error)
      if (error) hecho = 'archivada'
      else if (!data?.length) sinFilas('eliminar la cuenta')
    }
    if (hecho === 'archivada') {
      const { data, error } = await db.from('cuentas').update({ activa: false }).eq('id', cuenta.id).eq('user_id', userId).select('id')
      if (error) fallo('archivar la cuenta', error)
      if (!data?.length) sinFilas('archivar la cuenta')
    }
    return {
      resultado: hecho,
      explicacion: hecho === 'archivada'
        ? 'Tenía movimientos: se archivó. Ya no aparece en la app y su historial se conserva.'
        : 'Estaba vacía: se borró.',
    }
  },
}

export const HERRAMIENTAS: Herramienta[] = [
  obtenerContexto, listarMovimientos, resumenMes,
  registrarMovimientos, transferir, crearCuenta, fijarSaldo,
  editarMovimiento, borrarMovimientos, editarCuenta, eliminarCuenta,
]
