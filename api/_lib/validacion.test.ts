// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  ErrorHerramienta, leerFecha, leerMes, leerMonto, leerSaldo, rangoMes, separarDuplicados,
} from './validacion.js'

describe('leerMonto', () => {
  it('pasa unidades a centavos, desde número o texto', () => {
    expect(leerMonto(125.5)).toBe(12550)
    expect(leerMonto('1500.25')).toBe(150025)
    expect(leerMonto(0.1 + 0.2)).toBe(30)
  })
  it('rechaza cero, negativos, texto y montos absurdos', () => {
    for (const v of [0, -5, 'abc', NaN, Infinity, 0.001, 1e11, undefined]) {
      expect(() => leerMonto(v)).toThrow(ErrorHerramienta)
    }
  })
})

describe('leerSaldo', () => {
  it('acepta 0 y negativos, con el signo afuera de toCentavos', () => {
    expect(leerSaldo(0)).toBe(0)
    expect(leerSaldo(-200.5)).toBe(-20050)
    expect(leerSaldo('1250.10')).toBe(125010)
  })
  it('rechaza lo que no es número', () => {
    expect(() => leerSaldo('mil')).toThrow(ErrorHerramienta)
  })
})

describe('leerFecha', () => {
  const hoy = '2026-09-24'
  it('sin fecha es hoy', () => {
    expect(leerFecha(undefined, hoy)).toBe(hoy)
    expect(leerFecha('', hoy)).toBe(hoy)
  })
  it('acepta fechas reales hasta hoy', () => {
    expect(leerFecha('2026-02-28', hoy)).toBe('2026-02-28')
    expect(leerFecha(hoy, hoy)).toBe(hoy)
  })
  it('rechaza futuras, inexistentes y mal escritas', () => {
    for (const v of ['2026-09-25', '2026-02-30', '24/09/2026', '1999-12-31', 20260924]) {
      expect(() => leerFecha(v, hoy)).toThrow(ErrorHerramienta)
    }
  })
})

describe('leerMes / rangoMes', () => {
  it('por defecto el mes actual, y valida el formato', () => {
    expect(leerMes(undefined, '2026-09')).toBe('2026-09')
    expect(leerMes('2026-02', '2026-09')).toBe('2026-02')
    expect(() => leerMes('2026-13', '2026-09')).toThrow(ErrorHerramienta)
  })
  it('da el primer y el último día, con bisiestos', () => {
    expect(rangoMes('2024-02')).toEqual({ desde: '2024-02-01', hasta: '2024-02-29' })
    expect(rangoMes('2026-09')).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' })
  })
})

describe('separarDuplicados', () => {
  const cafe = { cuenta_id: 'c1', fecha: '2026-09-10', cantidad: -2500, descripcion: 'Café' }
  it('reimportar lo mismo no inserta nada', () => {
    const r = separarDuplicados([cafe], [{ ...cafe, descripcion: '  café ' }])
    expect(r.insertar).toEqual([])
    expect(r.duplicados).toHaveLength(1)
  })
  it('compara como multiconjunto: tres cafés contra dos registrados insertan uno', () => {
    const r = separarDuplicados([cafe, { ...cafe }, { ...cafe }], [cafe, cafe])
    expect(r.insertar).toHaveLength(1)
    expect(r.duplicados).toHaveLength(2)
  })
  it('otra cuenta, fecha o monto no es duplicado', () => {
    const r = separarDuplicados(
      [{ ...cafe, cuenta_id: 'c2' }, { ...cafe, fecha: '2026-09-11' }, { ...cafe, cantidad: -2600 }],
      [cafe],
    )
    expect(r.insertar).toHaveLength(3)
  })
})
