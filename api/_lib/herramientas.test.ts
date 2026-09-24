// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HERRAMIENTAS, type Contexto } from './herramientas.js'
import { ErrorHerramienta } from './validacion.js'
import { baseFalsa } from './baseFalsa.js'

const YO = 'u1'
const herramienta = (n: string) => HERRAMIENTAS.find(h => h.nombre === n)!

function mundo(opciones: { fallaInsert?: boolean } = {}) {
  const tablas = {
    profiles: [{ user_id: YO, nombre: 'Ana', moneda: 'GTQ', locale: 'es-GT', zona_horaria: 'America/Guatemala' }],
    cuentas: [
      { id: 'c1', user_id: YO, nombre: 'BI Ahorros', tipo: 'ahorro', saldo: 100000, activa: true },
      { id: 'c2', user_id: YO, nombre: 'Efectivo', tipo: 'efectivo', saldo: 5000, activa: true },
      { id: 'vieja', user_id: YO, nombre: 'Cerrada', tipo: 'otro', saldo: 0, activa: false },
      { id: 'ajena', user_id: 'u2', nombre: 'De otro', tipo: 'ahorro', saldo: 999, activa: true },
    ],
    categorias_usuario: [{ user_id: YO, nombre: 'Mascotas', tipo: 'gasto' }],
    tarjetas_credito: [] as Record<string, unknown>[],
    transacciones: [
      { id: 't1', user_id: YO, cuenta_id: 'c1', fecha: '2026-09-10', cantidad: -2500, descripcion: 'Café', categoria: 'Comida/Restaurantes', tipo: 'gasto' },
      { id: 't2', user_id: YO, cuenta_id: 'c1', fecha: '2026-09-01', cantidad: 800000, descripcion: 'Salario', categoria: 'Ingreso', tipo: 'ingreso' },
      { id: 't3', user_id: YO, cuenta_id: null, tarjeta_id: 'tc1', fecha: '2026-09-12', cantidad: -10000, descripcion: 'Súper', categoria: 'Supermercado', tipo: 'gasto_tc' },
      { id: 't4', user_id: YO, cuenta_id: 'c1', fecha: '2026-09-15', cantidad: -50000, descripcion: 'Pago TC', categoria: 'Pago Deudas', tipo: 'pago_tc' },
      { id: 'tx', user_id: 'u2', cuenta_id: 'ajena', fecha: '2026-09-10', cantidad: -1, descripcion: 'x', categoria: 'Otros', tipo: 'gasto' },
    ] as Record<string, unknown>[],
  }
  const { db, insertados } = baseFalsa(tablas, opciones)
  const ctx: Contexto = { db, userId: YO }
  return { tablas, insertados, ctx }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-24T18:00:00Z'))   // 12:00 en Guatemala
})

describe('obtener_contexto', () => {
  it('trae solo las cuentas activas propias, las categorías fusionadas y la fecha de hoy en la zona', async () => {
    const { ctx } = mundo()
    const r = await herramienta('obtener_contexto').ejecutar(ctx, {}) as {
      perfil: { hoy: string }; cuentas: { id: string; saldo: number }[]; categorias: { gasto: string[] }
    }
    expect(r.perfil.hoy).toBe('2026-09-24')
    expect(r.cuentas.map(c => c.id)).toEqual(['c1', 'c2'])
    expect(r.cuentas[0].saldo).toBe(1000)
    expect(r.categorias.gasto).toContain('Mascotas')
  })
})

describe('resumen_mes', () => {
  it('usa las reglas de la app: gasto_tc es gasto, pago_tc no', async () => {
    const { ctx } = mundo()
    const r = await herramienta('resumen_mes').ejecutar(ctx, { mes: '2026-09' }) as {
      ingresos: number; gastos: number; neto: number
    }
    expect(r.ingresos).toBe(8000)
    expect(r.gastos).toBe(125)   // 25 café + 100 súper con tarjeta; el pago de TC no
    expect(r.neto).toBe(7875)
  })
})

describe('listar_movimientos', () => {
  it('lista el mes pedido, con montos en unidades y nombre de cuenta, sin filas de otros', async () => {
    const { ctx } = mundo()
    const r = await herramienta('listar_movimientos').ejecutar(ctx, { mes: '2026-09', cuenta_id: 'c1' }) as {
      movimientos: { id: string; monto: number; cuenta?: string }[]
    }
    expect(r.movimientos.map(m => m.id).sort()).toEqual(['t1', 't2', 't4'])
    expect(r.movimientos.find(m => m.id === 't1')).toMatchObject({ monto: -25, cuenta: 'BI Ahorros' })
  })
})

describe('registrar_movimientos', () => {
  const gasto = { cuenta_id: 'c1', tipo: 'gasto', monto: 25, descripcion: 'Café', fecha: '2026-09-10', categoria: 'Comida/Restaurantes' }

  it('inserta con el signo del tipo y omite lo ya registrado', async () => {
    const { ctx, insertados, tablas } = mundo()
    const r = await herramienta('registrar_movimientos').ejecutar(ctx, {
      movimientos: [
        gasto,   // ya estaba (t1)
        { cuenta_id: 'c1', tipo: 'gasto', monto: 12.5, descripcion: 'Croquetas', categoria: 'Mascotas' },
        { cuenta_id: 'c2', tipo: 'ingreso', monto: 100, descripcion: 'Venta', fecha: '2026-09-20' },
      ],
    }) as { registrados: number; omitidos_por_duplicado: { indice: number }[] }
    expect(r.registrados).toBe(2)
    expect(r.omitidos_por_duplicado.map(d => d.indice)).toEqual([0])
    expect(insertados.transacciones).toEqual([
      expect.objectContaining({ user_id: YO, cuenta_id: 'c1', cantidad: -1250, fecha: '2026-09-24', categoria: 'Mascotas' }),
      expect.objectContaining({ user_id: YO, cuenta_id: 'c2', cantidad: 10000, categoria: 'Otros', tipo: 'ingreso' }),
    ])
    expect(insertados.transacciones.some(t => 'indice' in t)).toBe(false)
    expect(tablas.cuentas.find(c => c.id === 'c2')!.saldo).toBe(15000)
  })

  it('con omitir_duplicados: false registra aunque se repita', async () => {
    const { ctx } = mundo()
    const r = await herramienta('registrar_movimientos').ejecutar(ctx, { movimientos: [gasto], omitir_duplicados: false }) as { registrados: number }
    expect(r.registrados).toBe(1)
  })

  it('es todo o nada: una fila inválida no deja registrar ninguna y dice qué corregir', async () => {
    const { ctx, insertados } = mundo()
    const intento = herramienta('registrar_movimientos').ejecutar(ctx, {
      movimientos: [
        { ...gasto, descripcion: 'Válido' },
        { ...gasto, categoria: 'Inventada' },
        { ...gasto, cuenta_id: 'ajena' },
        { ...gasto, cuenta_id: 'vieja' },
        { ...gasto, fecha: '2026-10-01' },
        { ...gasto, tipo: 'gasto_tc' },
      ],
    })
    await expect(intento).rejects.toThrow(ErrorHerramienta)
    const msg = await intento.catch((e: Error) => e.message)
    expect(msg).toMatch(/movimientos\[1\]\.categoria/)
    expect(msg).toMatch(/movimientos\[2\]\.cuenta_id/)
    expect(msg).toMatch(/movimientos\[3\]\.cuenta_id/)
    expect(msg).toMatch(/movimientos\[4\]\.fecha/)
    expect(msg).toMatch(/movimientos\[5\]\.tipo/)
    expect(msg).toMatch(/Mascotas/)
    expect(insertados.transacciones).toBeUndefined()
  })

  it('un fallo de la base no filtra el texto de Postgres', async () => {
    const { ctx } = mundo({ fallaInsert: true })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(herramienta('registrar_movimientos').ejecutar(ctx, { movimientos: [{ ...gasto, descripcion: 'Nuevo' }] }))
      .rejects.toThrow(/No se pudo registrar los movimientos \(no se registró ninguno\)/)
  })
})

describe('transferir', () => {
  it('inserta las dos patas como en la app', async () => {
    const { ctx, insertados } = mundo()
    await herramienta('transferir').ejecutar(ctx, { desde_cuenta_id: 'c1', hacia_cuenta_id: 'c2', monto: 50 })
    expect(insertados.transacciones).toEqual([
      expect.objectContaining({ cuenta_id: 'c1', cantidad: -5000, tipo: 'ajuste', categoria: 'Transferencia' }),
      expect.objectContaining({ cuenta_id: 'c2', cantidad: 5000, tipo: 'ajuste', categoria: 'Transferencia' }),
    ])
  })
  it('no a la misma cuenta', async () => {
    const { ctx } = mundo()
    await expect(herramienta('transferir').ejecutar(ctx, { desde_cuenta_id: 'c1', hacia_cuenta_id: 'c1', monto: 5 }))
      .rejects.toThrow(/misma/)
  })
})

describe('crear_cuenta', () => {
  it('crea en 0 y pone el saldo con un ajuste', async () => {
    const { ctx, insertados } = mundo()
    const r = await herramienta('crear_cuenta').ejecutar(ctx, { nombre: 'Banrural', saldo_inicial: 300 }) as {
      cuenta: { nombre: string; saldo: number }
    }
    expect(insertados.cuentas).toEqual([expect.objectContaining({ nombre: 'Banrural', saldo: 0, tipo: 'ahorro' })])
    expect(insertados.transacciones).toEqual([expect.objectContaining({ cantidad: 30000, tipo: 'ajuste' })])
    expect(r.cuenta).toMatchObject({ nombre: 'Banrural', saldo: 300 })
  })
  it('no duplica una cuenta activa con el mismo nombre', async () => {
    const { ctx, insertados } = mundo()
    await expect(herramienta('crear_cuenta').ejecutar(ctx, { nombre: ' bi ahorros ' })).rejects.toThrow(/Ya tienes/)
    expect(insertados.cuentas).toBeUndefined()
  })
})

describe('fijar_saldo_cuenta', () => {
  it('registra la diferencia contra el saldo de la base', async () => {
    const { ctx, insertados, tablas } = mundo()
    const r = await herramienta('fijar_saldo_cuenta').ejecutar(ctx, { cuenta_id: 'c1', saldo: 1250.5 }) as { ajuste: number }
    expect(r.ajuste).toBe(250.5)
    expect(insertados.transacciones).toEqual([expect.objectContaining({ cantidad: 25050, tipo: 'ajuste', categoria: 'Ajuste de cuenta' })])
    expect(tablas.cuentas.find(c => c.id === 'c1')!.saldo).toBe(125050)
  })
  it('sin diferencia no escribe', async () => {
    const { ctx, insertados } = mundo()
    const r = await herramienta('fijar_saldo_cuenta').ejecutar(ctx, { cuenta_id: 'c1', saldo: 1000 }) as { sin_cambios?: boolean }
    expect(r.sin_cambios).toBe(true)
    expect(insertados.transacciones).toBeUndefined()
  })
})
