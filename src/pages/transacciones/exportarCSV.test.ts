import { describe, it, expect } from 'vitest'
import { csvCampo, csvNumero, construirCSV } from './exportarCSV'
import type { Transaccion } from '../../hooks/useTransacciones'

const txn = (parcial: Partial<Transaccion>): Transaccion => ({
  id: 't1', fecha: '2026-09-17', cantidad: -123456, descripcion: 'Super',
  categoria: 'Supermercado', tipo: 'gasto', cuenta_id: 'c1',
  ...parcial,
} as Transaccion)

const nombres = {
  cuenta:  (id: string) => (id === 'c1' ? 'BI Ahorros' : id),
  tarjeta: (id: string) => (id === 'k1' ? 'Ysi Visa' : id),
}

describe('csvCampo', () => {
  it('encierra en comillas y duplica las internas', () => {
    expect(csvCampo('Super')).toBe('"Super"')
    expect(csvCampo('El "bueno"')).toBe('"El ""bueno"""')
  })

  it('neutraliza la inyección de fórmulas', () => {
    // Excel y Sheets evalúan un campo que empieza con estos caracteres, y la
    // descripción la escribe el usuario.
    expect(csvCampo('=1+1')).toBe(`"'=1+1"`)
    expect(csvCampo('+HYPERLINK("http://x")')).toBe(`"'+HYPERLINK(""http://x"")"`)
    expect(csvCampo('-2+3')).toBe(`"'-2+3"`)
    expect(csvCampo('@SUM(A1)')).toBe(`"'@SUM(A1)"`)
    expect(csvCampo('\tcmd')).toBe(`"'\tcmd"`)
  })

  it('no toca un campo que solo CONTIENE esos caracteres sin empezar con ellos', () => {
    expect(csvCampo('Uber = viaje')).toBe('"Uber = viaje"')
  })

  it('sí prefija un string que empieza con guion: no puede saber que es un monto', () => {
    // Por esto los montos NO pasan por acá, sino por csvNumero.
    expect(csvCampo('-1234.56')).toBe(`"'-1234.56"`)
  })
})

describe('csvNumero', () => {
  it('emite el monto sin comillas ni prefijo, para que la hoja lo sume', () => {
    // El bug que esto evita: pasar el monto por csvCampo emitía "'-1234.56",
    // que Excel lee como texto, y la columna de montos deja de ser sumable.
    expect(csvNumero(-123456)).toBe('-1234.56')
    expect(csvNumero(123456)).toBe('1234.56')
    expect(csvNumero(0)).toBe('0.00')
    expect(csvNumero(1)).toBe('0.01')
  })
})

describe('construirCSV', () => {
  it('abre con BOM para que Excel en Windows lea el UTF-8', () => {
    expect(construirCSV([], nombres).startsWith('﻿')).toBe(true)
  })

  it('emite la cabecera aunque no haya filas', () => {
    expect(construirCSV([], nombres)).toBe('﻿fecha,descripcion,categoria,tipo,cantidad_Q,cuenta')
  })

  it('el monto va como número, no como texto entrecomillado', () => {
    const csv = construirCSV([txn({ cantidad: -123456 })], nombres)
    expect(csv).toContain(',-1234.56,')
    expect(csv).not.toContain(`"'-1234.56"`)
  })

  it('resuelve el nombre de la cuenta, o el de la tarjeta si no hay cuenta', () => {
    const csv = construirCSV([
      txn({ id: 'a', cuenta_id: 'c1' }),
      txn({ id: 'b', cuenta_id: null, tarjeta_id: 'k1', tipo: 'gasto_tc' }),
      txn({ id: 'c', cuenta_id: null, tarjeta_id: null }),
    ], nombres)
    expect(csv).toContain('"BI Ahorros"')
    expect(csv).toContain('"Ysi Visa"')
    // Sin cuenta ni tarjeta queda el marcador, no un id crudo ni vacío.
    expect(csv).toContain('"TC"')
  })

  it('una descripción con coma o salto de línea no rompe las columnas', () => {
    const csv = construirCSV([txn({ descripcion: 'Uber, centro\ncon espera' })], nombres)
    expect(csv).toContain('"Uber, centro\ncon espera"')
    // La cabecera sigue teniendo seis columnas.
    expect(csv.split('\n')[0].split(',')).toHaveLength(6)
  })
})
