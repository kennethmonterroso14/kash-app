import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { hoyEn, ahoraEn, mesActualEn, diaEn, zonaValida, ZONA_GT } from './constants'

/**
 * Lo que importa acá no es el formato: es que la fecha que se GUARDA salga de
 * la zona del usuario y no de la del navegador. De estas funciones salen los
 * límites de mes de todas las consultas, así que un corrimiento de un día mueve
 * transacciones de un mes a otro.
 */

// 03:00 UTC del 5 = 21:00 del 4 en Guatemala y 12:00 del 5 en Tokio.
const INSTANTE_QUE_CRUZA = new Date('2026-04-05T03:00:00Z')

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('hoyEn', () => {
  it('da días DISTINTOS para el mismo instante en dos zonas', () => {
    vi.setSystemTime(INSTANTE_QUE_CRUZA)
    expect(hoyEn('America/Guatemala')).toBe('2026-04-04')
    expect(hoyEn('Asia/Tokyo')).toBe('2026-04-05')
    expect(hoyEn('UTC')).toBe('2026-04-05')
  })

  it('cubre el rango completo de offsets, no solo los dos lados de UTC', () => {
    vi.setSystemTime(INSTANTE_QUE_CRUZA)
    expect(hoyEn('Pacific/Kiritimati')).toBe('2026-04-05')  // UTC+14
    expect(hoyEn('Pacific/Niue')).toBe('2026-04-04')        // UTC-11
  })

  it('emite siempre YYYY-MM-DD con ceros a la izquierda', () => {
    vi.setSystemTime(new Date('2026-01-09T18:00:00Z'))
    expect(hoyEn(ZONA_GT)).toBe('2026-01-09')
    expect(hoyEn(ZONA_GT)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('lanza con una zona inválida en lugar de caer a la del navegador', () => {
    // Un fallback silencioso escribiría fechas equivocadas en la base. Quien
    // lee el perfil valida con zonaValida() y muestra un error.
    vi.setSystemTime(INSTANTE_QUE_CRUZA)
    expect(() => hoyEn('Nada/Inventado')).toThrow()
  })

  it('el caché por zona no devuelve la fecha de la primera zona consultada', () => {
    vi.setSystemTime(INSTANTE_QUE_CRUZA)
    expect(hoyEn('Asia/Tokyo')).toBe('2026-04-05')
    expect(hoyEn('America/Guatemala')).toBe('2026-04-04')
    expect(hoyEn('Asia/Tokyo')).toBe('2026-04-05')
  })
})

describe('mesActualEn', () => {
  it('el cruce de día también puede cruzar el MES, que es lo que mueve las consultas', () => {
    // 03:00 UTC del 1 de mayo = 21:00 del 30 de abril en Guatemala.
    vi.setSystemTime(new Date('2026-05-01T03:00:00Z'))
    expect(mesActualEn('America/Guatemala')).toBe('2026-04')
    expect(mesActualEn('UTC')).toBe('2026-05')
  })
})

describe('ahoraEn', () => {
  it('los campos de calendario son los de la zona pedida, no los del runtime', () => {
    vi.setSystemTime(INSTANTE_QUE_CRUZA)
    const gt = ahoraEn('America/Guatemala')
    expect([gt.getFullYear(), gt.getMonth() + 1, gt.getDate()]).toEqual([2026, 4, 4])
    const tokio = ahoraEn('Asia/Tokyo')
    expect(tokio.getDate()).toBe(5)
  })

  it('se ancla al mediodía, así que DST no corre el día', () => {
    // 00:30 UTC del 29 de marzo: Madrid está en el salto de horario de verano.
    vi.setSystemTime(new Date('2026-03-29T00:30:00Z'))
    const madrid = ahoraEn('Europe/Madrid')
    expect(madrid.getDate()).toBe(29)
    expect(madrid.getHours()).toBe(12)
  })
})

describe('zonaValida', () => {
  it('acepta zonas IANA y rechaza cualquier otra cosa', () => {
    expect(zonaValida('America/Guatemala')).toBe(true)
    expect(zonaValida('UTC')).toBe(true)
    expect(zonaValida('Nada/Inventado')).toBe(false)
    expect(zonaValida('')).toBe(false)
    expect(zonaValida('GMT-6')).toBe(false)
  })
})

describe('diaEn', () => {
  /**
   * Es la función que resuelve un `timestamptz` — hoy `ciclos_tc.cerrado_at` —
   * al día de calendario del usuario. El bug que tapa es mostrar el día
   * equivocado por resolver el instante en la zona del navegador.
   */
  it('resuelve el mismo instante a días distintos según la zona', () => {
    // 03:00 UTC: en Guatemala (UTC−6) todavía es el día anterior.
    const instante = '2026-09-21T03:00:00Z'
    expect(diaEn(instante, 'America/Guatemala')).toBe('2026-09-20')
    expect(diaEn(instante, 'UTC')).toBe('2026-09-21')
    expect(diaEn(instante, 'Asia/Tokyo')).toBe('2026-09-21')
  })

  it('no depende de la zona del proceso', () => {
    // El instante trae su offset: lo que decide el día es la zona pedida, no
    // la del sistema donde corre el test.
    expect(diaEn('2026-01-01T05:30:00+00:00', 'America/Guatemala')).toBe('2025-12-31')
  })

  it('lanza con una zona inválida en lugar de caer a una por defecto', () => {
    // Igual que `hoyEn`: un fallback silencioso mostraría un día que no es.
    expect(() => diaEn('2026-09-21T03:00:00Z', 'Nada/Inventado')).toThrow()
  })
})
