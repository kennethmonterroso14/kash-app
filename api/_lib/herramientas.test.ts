// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HERRAMIENTAS, type Contexto } from './herramientas.js'
import { ErrorHerramienta } from './validacion.js'
import { baseFalsa } from './baseFalsa.js'

const YO = 'u1'
const herramienta = (n: string) => HERRAMIENTAS.find(h => h.nombre === n)!

function mundo(opciones: { fallaInsert?: boolean; permiso?: boolean; rlsBloqueaModificar?: boolean } = {}) {
  const tablas = {
    profiles: [{
      user_id: YO, nombre: 'Ana', moneda: 'GTQ', locale: 'es-GT', zona_horaria: 'America/Guatemala',
      ia_puede_editar: opciones.permiso ?? false,
    }],
    pagos_recurrentes: [] as Record<string, unknown>[],
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

describe('editar y borrar: solo con el permiso de la persona', () => {
  const casos: [string, Record<string, unknown>][] = [
    ['editar_movimiento', { id: 't1', descripcion: 'x' }],
    ['borrar_movimientos', { ids: ['t1'] }],
    ['editar_cuenta', { cuenta_id: 'c2', nombre: 'Caja' }],
    ['eliminar_cuenta', { cuenta_id: 'c2' }],
  ]
  it.each(casos)('%s sin permiso no toca nada y dice cómo activarlo', async (nombre, args) => {
    const { ctx, tablas } = mundo()
    const antes = JSON.stringify(tablas)
    await expect(herramienta(nombre).ejecutar(ctx, args)).rejects.toThrow(/Ajustes → Asistentes de IA/)
    expect(JSON.stringify(tablas)).toBe(antes)
  })

  it('si RLS rechaza aunque el perfil diga que sí (se apagó en el medio), no finge que editó', async () => {
    const { ctx } = mundo({ permiso: true, rlsBloqueaModificar: true })
    await expect(herramienta('editar_movimiento').ejecutar(ctx, { id: 't1', descripcion: 'x' })).rejects.toThrow(/desactivó/)
    await expect(herramienta('borrar_movimientos').ejecutar(ctx, { ids: ['t1'] })).rejects.toThrow(/desactivó/)
  })

  it('las borrar son destructivas para el cliente; editar no', () => {
    expect(herramienta('borrar_movimientos').destructiva).toBe(true)
    expect(herramienta('eliminar_cuenta').destructiva).toBe(true)
    expect(herramienta('editar_movimiento').destructiva).toBeUndefined()
  })
})

describe('editar_movimiento', () => {
  it('cambia monto y categoría con el signo del tipo, y el saldo se ajusta', async () => {
    const { ctx, tablas } = mundo({ permiso: true })
    await herramienta('editar_movimiento').ejecutar(ctx, { id: 't1', monto: 30, categoria: 'Mascotas' })
    expect(tablas.transacciones.find(t => t.id === 't1')).toMatchObject({ cantidad: -3000, categoria: 'Mascotas' })
    expect(tablas.cuentas.find(c => c.id === 'c1')!.saldo).toBe(100000 - 500)
  })
  it('no edita tarjetas ni el monto de un ajuste, ni movimientos ajenos', async () => {
    const { ctx } = mundo({ permiso: true })
    await expect(herramienta('editar_movimiento').ejecutar(ctx, { id: 't3', descripcion: 'x' })).rejects.toThrow(/tarjeta/)
    await expect(herramienta('editar_movimiento').ejecutar(ctx, { id: 'tx', descripcion: 'x' })).rejects.toThrow(/no es uno de tus/)
  })
})

describe('borrar_movimientos', () => {
  it('borra todos o ninguno, y revierte el saldo', async () => {
    const { ctx, tablas } = mundo({ permiso: true })
    await expect(herramienta('borrar_movimientos').ejecutar(ctx, { ids: ['t1', 'tx'] })).rejects.toThrow(/No se borró nada/)
    await expect(herramienta('borrar_movimientos').ejecutar(ctx, { ids: ['t1', 't3'] })).rejects.toThrow(/tarjeta/)
    expect(tablas.transacciones).toHaveLength(5)
    const r = await herramienta('borrar_movimientos').ejecutar(ctx, { ids: ['t1', 't1'] }) as { borrados: number }
    expect(r.borrados).toBe(1)
    expect(tablas.transacciones.some(t => t.id === 't1')).toBe(false)
    expect(tablas.cuentas.find(c => c.id === 'c1')!.saldo).toBe(102500)
  })
})

describe('editar_cuenta', () => {
  it('renombra, pero no a un nombre que ya existe', async () => {
    const { ctx, tablas } = mundo({ permiso: true })
    await expect(herramienta('editar_cuenta').ejecutar(ctx, { cuenta_id: 'c2', nombre: 'bi ahorros' })).rejects.toThrow(/Ya tienes/)
    await herramienta('editar_cuenta').ejecutar(ctx, { cuenta_id: 'c2', nombre: 'Caja chica', tipo: 'efectivo' })
    expect(tablas.cuentas.find(c => c.id === 'c2')).toMatchObject({ nombre: 'Caja chica' })
  })
})

describe('eliminar_cuenta', () => {
  it('con saldo se niega y dice qué hacer', async () => {
    const { ctx } = mundo({ permiso: true })
    await expect(herramienta('eliminar_cuenta').ejecutar(ctx, { cuenta_id: 'c2' })).rejects.toThrow(/Q50\.00/)
  })
  it('con movimientos y en cero, archiva', async () => {
    const { ctx, tablas } = mundo({ permiso: true })
    const c1 = tablas.cuentas.find(c => c.id === 'c1')!
    c1.saldo = 0
    const r = await herramienta('eliminar_cuenta').ejecutar(ctx, { cuenta_id: 'c1' }) as { resultado: string }
    expect(r.resultado).toBe('archivada')
    expect(c1.activa).toBe(false)
  })
  it('vacía y en cero, la borra', async () => {
    const { ctx, tablas } = mundo({ permiso: true })
    tablas.cuentas.push({ id: 'c9', user_id: YO, nombre: 'Nueva', tipo: 'ahorro', saldo: 0, activa: true })
    const r = await herramienta('eliminar_cuenta').ejecutar(ctx, { cuenta_id: 'c9' }) as { resultado: string }
    expect(r.resultado).toBe('borrada')
    expect(tablas.cuentas.some(c => c.id === 'c9')).toBe(false)
  })
})
