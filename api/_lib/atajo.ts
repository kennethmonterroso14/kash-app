/**
 * /api/atajo: el POST que hace la automatización "Transacción" de Atajos en
 * cada pago con Apple Pay (docs/APPLE_PAY.md). Es una función de `Request` a
 * `Response` con el RPC inyectado, igual que el conector MCP, para probarla sin
 * red.
 *
 * Responde TEXTO plano y no JSON: el atajo termina en "Mostrar notificación"
 * con lo que devuelve la URL, y un JSON se vería tal cual en la pantalla.
 */
import { createHash } from 'node:crypto'
import { formatMoneda, toCentavos } from '../../src/lib/finanzas.js'

/** Lo que devuelve el RPC `registrar_pago_atajo` (schema.sql, sección 13). */
export interface RespuestaPago {
  ok: boolean
  codigo: 'registrado' | 'duplicado' | 'clave_invalida' | 'monto_invalido' | 'sin_tarjeta'
    | 'tarjeta_sin_asignar' | 'destino_inactivo' | 'sin_perfil'
  centavos?: number
  moneda?: string
  locale?: string
  categoria?: string
  destino?: string
  tarjeta?: string
}

export interface DependenciasAtajo {
  registrar(claveHash: string, centavos: number, comercio: string, tarjeta: string): Promise<RespuestaPago>
}

/** SHA-256 en hex, igual que `crypto.subtle` en Ajustes y `sha256()` en Postgres. */
export const hashClave = (clave: string): string => createHash('sha256').update(clave, 'utf8').digest('hex')

/**
 * El importe como lo manda el atajo → centavos, o null si no se entiende.
 *
 * Atajos lo serializa según el idioma del iPhone: "Q45.00", "$1,234.56",
 * "1.234,56 €", "45,5". El separador decimal es el ÚLTIMO de los dos si hay
 * ambos; si hay uno solo, es decimal únicamente si aparece una vez y lo siguen
 * 1 o 2 dígitos ("1,234" son mil doscientos). Siempre positivo: la automatización
 * solo se dispara con pagos.
 */
export function leerImporte(valor: unknown): number | null {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) && valor !== 0 ? toCentavos(Math.abs(valor)) || null : null
  }
  if (typeof valor !== 'string') return null
  const s = valor.replace(/[^\d.,]/g, '')
  if (!/\d/.test(s)) return null
  const punto = s.lastIndexOf('.')
  const coma = s.lastIndexOf(',')
  let decimal: '.' | ',' | null = null
  if (punto >= 0 && coma >= 0) {
    decimal = punto > coma ? '.' : ','
  } else if (punto >= 0 || coma >= 0) {
    const sep = punto >= 0 ? '.' : ','
    const despues = s.length - s.lastIndexOf(sep) - 1
    if (s.split(sep).length === 2 && despues >= 1 && despues <= 2) decimal = sep
  }
  const miles = decimal === '.' ? /,/g : decimal === ',' ? /\./g : /[.,]/g
  const normal = s.replace(miles, '').replace(',', '.')
  const n = Number(normal)
  if (!Number.isFinite(n) || n <= 0) return null
  const centavos = toCentavos(n)
  return centavos > 0 ? centavos : null
}

const texto = (cuerpo: string, status = 200) =>
  new Response(cuerpo, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

/** El texto que el atajo muestra, y su status. */
export function respuestaPara(r: RespuestaPago, importeCrudo: string): { status: number; cuerpo: string } {
  const monto = r.centavos !== undefined && r.moneda && r.locale
    ? formatMoneda(r.centavos, { moneda: r.moneda, locale: r.locale })
    : ''
  switch (r.codigo) {
    case 'registrado':
      return { status: 200, cuerpo: `Vorta ✓ ${monto} · ${r.categoria} · ${r.destino}` }
    case 'duplicado':
      return { status: 200, cuerpo: `Vorta: ese pago ya estaba registrado (${monto} · ${r.destino}).` }
    case 'clave_invalida':
      return { status: 401, cuerpo: 'Vorta: la clave del atajo no es válida. Genera una nueva en Ajustes → Apple Pay y ponla en el atajo.' }
    case 'monto_invalido':
      return { status: 400, cuerpo: `Vorta: no entendí el importe "${importeCrudo}". El pago no se registró.` }
    case 'sin_tarjeta':
      return { status: 400, cuerpo: 'Vorta: el atajo no mandó el nombre de la tarjeta (campo "tarjeta"). Revisa el atajo.' }
    case 'tarjeta_sin_asignar':
      return { status: 409, cuerpo: `Vorta: la tarjeta "${r.tarjeta}" no está asignada. Asígnala en Ajustes → Apple Pay; este pago no se registró.` }
    case 'destino_inactivo':
      return { status: 409, cuerpo: `Vorta: la tarjeta "${r.tarjeta}" va a una cuenta o tarjeta archivada. Cámbiala en Ajustes → Apple Pay; este pago no se registró.` }
    case 'sin_perfil':
      return { status: 409, cuerpo: 'Vorta: abre la app y termina de configurar tu cuenta.' }
  }
}

async function leerCuerpo(request: Request): Promise<Record<string, unknown> | null> {
  const tipo = request.headers.get('content-type') ?? ''
  try {
    if (tipo.includes('application/x-www-form-urlencoded') || tipo.includes('multipart/form-data')) {
      return Object.fromEntries((await request.formData()).entries())
    }
    const crudo = await request.text()
    return crudo.trim() ? JSON.parse(crudo) as Record<string, unknown> : {}
  } catch {
    return null
  }
}

export async function manejarAtajo(request: Request, deps: DependenciasAtajo): Promise<Response> {
  if (request.method !== 'POST') {
    return texto('Vorta: esta dirección la usa el atajo de Apple Pay, con POST. Ver Ajustes → Apple Pay.', 405)
  }
  const cuerpo = await leerCuerpo(request)
  if (!cuerpo || typeof cuerpo !== 'object') return texto('Vorta: el atajo mandó un cuerpo que no se puede leer. Usa "Cuerpo de la solicitud: JSON".', 400)

  // La clave va en el encabezado; en el cuerpo también se acepta, porque en
  // Atajos es más fácil de escribir ahí.
  const clave = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]?.trim()
    ?? (typeof cuerpo.clave === 'string' ? cuerpo.clave.trim() : '')
  if (!clave) return texto(respuestaPara({ ok: false, codigo: 'clave_invalida' }, '').cuerpo, 401)

  const importeCrudo = String(cuerpo.monto ?? '')
  const centavos = leerImporte(cuerpo.monto)
  if (centavos === null) {
    const r = respuestaPara({ ok: false, codigo: 'monto_invalido' }, importeCrudo)
    return texto(r.cuerpo, r.status)
  }
  const comercio = typeof cuerpo.comercio === 'string' ? cuerpo.comercio : ''
  const tarjeta = typeof cuerpo.tarjeta === 'string' ? cuerpo.tarjeta : ''

  let resultado: RespuestaPago
  try {
    resultado = await deps.registrar(hashClave(clave), centavos, comercio, tarjeta)
  } catch (e) {
    console.error('[atajo] el RPC falló:', e)
    return texto('Vorta: no se pudo registrar el pago. Anótalo a mano en la app.', 502)
  }
  const r = respuestaPara(resultado, importeCrudo)
  return texto(r.cuerpo, r.status)
}
