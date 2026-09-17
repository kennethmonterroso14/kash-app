import type { Transaccion } from '../../hooks/useTransacciones'

/**
 * Escapa un campo CSV.
 *
 * Las comillas van siempre, y el prefijo `'` neutraliza la inyección de
 * fórmulas: Excel y Sheets EVALÚAN un campo que empieza con `=`, `+`, `-`, `@`,
 * tab o CR, así que una descripción como `=HYPERLINK(...)` se ejecutaría al
 * abrir el archivo. La descripción la escribe el usuario, o sea que es el
 * camino de entrada.
 */
export const csvCampo = (valor: string | number): string => {
  const s = String(valor)
  const seguro = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${seguro.replace(/"/g, '""')}"`
}

/**
 * Un monto: SIN comillas y sin el prefijo de `csvCampo`.
 *
 * No es un detalle estético. `csvCampo` prefija todo lo que empieza con `-`,
 * así que pasarle un gasto emitía `"'-1234.56"` y la hoja de cálculo lo leía
 * como TEXTO — la columna de montos no se podía sumar. Y el guard no aplica
 * acá: este número lo genera la app, no el usuario, y siempre tiene la forma
 * `-?\d+\.\d\d`.
 */
export const csvNumero = (centavos: number): string => (centavos / 100).toFixed(2)

const CABECERAS = ['fecha', 'descripcion', 'categoria', 'tipo', 'cantidad_Q', 'cuenta'] as const

interface Nombres {
  cuenta: (id: string) => string
  tarjeta: (id: string) => string
}

/**
 * Arma el CSV completo. Separado de la descarga para poder probarlo: lo que
 * hay que verificar es el escapado, no el `<a download>`.
 *
 * El BOM inicial es para que Excel en Windows reconozca el UTF-8 y no destroce
 * los acentos.
 */
export function construirCSV(txns: Transaccion[], nombres: Nombres): string {
  const filas = txns.map(t => [
    csvCampo(t.fecha),
    csvCampo(t.descripcion),
    csvCampo(t.categoria),
    csvCampo(t.tipo),
    // En quetzales y no en centavos: el archivo es para leerlo en una hoja de
    // cálculo, no para volver a importarlo.
    csvNumero(t.cantidad),
    csvCampo(
      t.cuenta_id ? nombres.cuenta(t.cuenta_id)
      : t.tarjeta_id ? nombres.tarjeta(t.tarjeta_id)
      : 'TC',
    ),
  ].join(','))
  return '﻿' + [CABECERAS.join(','), ...filas].join('\n')
}

/** Dispara la descarga en el navegador. */
export function descargarCSV(contenido: string, nombreArchivo: string): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  a.click()
  URL.revokeObjectURL(url)
}
