// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { hashClave, leerImporte, manejarAtajo, type DependenciasAtajo, type RespuestaPago } from './atajo.js'

describe('leerImporte', () => {
  it.each([
    ['Q45.00', 4500],
    ['$1,234.56', 123456],
    ['1.234,56 €', 123456],
    ['45,5', 4550],
    ['GTQ 1,234', 123400],     // una coma con tres dígitos: separador de miles
    ['Q1.000', 100000],        // un punto con tres dígitos: miles también
    ['12', 1200],
    ['-Q45.00', 4500],         // siempre positivo: la automatización solo manda pagos
    [45.5, 4550],
  ])('%s → %i centavos', (entrada, esperado) => {
    expect(leerImporte(entrada)).toBe(esperado)
  })

  it.each([[''], ['Q'], ['abc'], ['0.00'], [0], [NaN], [null], [undefined], [{}]])('%s no se entiende', entrada => {
    expect(leerImporte(entrada)).toBeNull()
  })
})

describe('hashClave', () => {
  it('es el SHA-256 hex estándar (lo mismo que calculan el navegador y Postgres)', () => {
    expect(hashClave('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(hashClave('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

function deps(respuesta: RespuestaPago | Error): DependenciasAtajo & { registrar: ReturnType<typeof vi.fn> } {
  return {
    registrar: vi.fn(async () => {
      if (respuesta instanceof Error) throw respuesta
      return respuesta
    }),
  }
}

const post = (cuerpo: unknown, headers: Record<string, string> = { Authorization: 'Bearer mi-clave' }) =>
  new Request('https://vorta.test/api/atajo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  })

const registrado: RespuestaPago = {
  ok: true, codigo: 'registrado', centavos: 4500, moneda: 'GTQ', locale: 'es-GT',
  categoria: 'Supermercado', destino: 'BAC Débito',
}

describe('manejarAtajo', () => {
  it('registra: manda el HASH de la clave, el importe en centavos, y contesta texto para la notificación', async () => {
    const d = deps(registrado)
    const r = await manejarAtajo(post({ monto: 'Q45.00', comercio: 'Super La Torre', tarjeta: 'BAC Débito' }), d)
    expect(r.status).toBe(200)
    expect(r.headers.get('Content-Type')).toMatch(/text\/plain/)
    expect(await r.text()).toBe('Vorta ✓ Q45.00 · Supermercado · BAC Débito')
    expect(d.registrar).toHaveBeenCalledWith(hashClave('mi-clave'), 4500, 'Super La Torre', 'BAC Débito')
  })

  it('si el pago quedó por categorizar, lo dice en vez de afirmar una categoría', async () => {
    const r = await manejarAtajo(post({ monto: 45, comercio: 'x', tarjeta: 't' }), deps({ ...registrado, por_categorizar: true }))
    expect(await r.text()).toBe('Vorta ✓ Q45.00 · BAC Débito. Abre Vorta para elegir la categoría.')
  })

  it('acepta la clave en el cuerpo, y un formulario en lugar de JSON', async () => {
    const d = deps(registrado)
    await manejarAtajo(post({ clave: 'en-el-cuerpo', monto: 45, comercio: 'x', tarjeta: 't' }, {}), d)
    expect(d.registrar).toHaveBeenLastCalledWith(hashClave('en-el-cuerpo'), 4500, 'x', 't')
    const form = new Request('https://vorta.test/api/atajo', {
      method: 'POST',
      headers: { Authorization: 'Bearer f', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ monto: '12,50', comercio: 'Café', tarjeta: 'Visa' }).toString(),
    })
    await manejarAtajo(form, d)
    expect(d.registrar).toHaveBeenLastCalledWith(hashClave('f'), 1250, 'Café', 'Visa')
  })

  it('sin clave: 401 y no llama a la base', async () => {
    const d = deps(registrado)
    const r = await manejarAtajo(post({ monto: 45 }, {}), d)
    expect(r.status).toBe(401)
    expect(d.registrar).not.toHaveBeenCalled()
  })

  it('importe ilegible: 400, lo cita y no llama a la base', async () => {
    const d = deps(registrado)
    const r = await manejarAtajo(post({ monto: 'gratis', tarjeta: 't' }), d)
    expect(r.status).toBe(400)
    expect(await r.text()).toMatch(/"gratis"/)
    expect(d.registrar).not.toHaveBeenCalled()
  })

  it.each<[RespuestaPago, number, RegExp]>([
    [{ ok: false, codigo: 'clave_invalida' }, 401, /Genera una nueva/],
    [{ ok: false, codigo: 'tarjeta_sin_asignar', tarjeta: 'Amex' }, 409, /"Amex" no está asignada.*no se registró/],
    [{ ok: false, codigo: 'destino_inactivo', tarjeta: 'Vieja' }, 409, /archivada/],
    [{ ok: true, codigo: 'duplicado', centavos: 4500, moneda: 'GTQ', locale: 'es-GT', destino: 'BAC' }, 200, /ya estaba registrado \(Q45\.00 · BAC\)/],
  ])('%o → %i', async (respuesta, status, mensaje) => {
    const r = await manejarAtajo(post({ monto: 45, comercio: 'x', tarjeta: 't' }), deps(respuesta))
    expect(r.status).toBe(status)
    expect(await r.text()).toMatch(mensaje)
  })

  it('si la base falla, dice que se anote a mano y no filtra el error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await manejarAtajo(post({ monto: 45, tarjeta: 't' }), deps(new Error('secreto de postgres')))
    expect(r.status).toBe(502)
    const t = await r.text()
    expect(t).toMatch(/Anótalo a mano/)
    expect(t).not.toMatch(/postgres/)
  })

  it('GET explica para qué es la dirección', async () => {
    const r = await manejarAtajo(new Request('https://vorta.test/api/atajo'), deps(registrado))
    expect(r.status).toBe(405)
  })
})
