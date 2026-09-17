import { useMemo } from 'react'
import { useSesion } from '../context/sesion'
import { hoyEn, ahoraEn, mesActualEn } from '../lib/constants'

export interface Fechas {
  /** Hoy como 'YYYY-MM-DD' en la zona del usuario. */
  hoy: () => string
  /** Mes actual como 'YYYY-MM' en la zona del usuario. */
  mesActual: () => string
  /** Date con los campos de calendario de hoy. No es un instante real. */
  ahora: () => Date
  /** La zona en uso, para mostrarla o pasarla a un cálculo. */
  zona: string
}

/**
 * Las fechas de hoy en la zona horaria del usuario, no en la del navegador.
 *
 * Ninguna de las tres lanza acá, aunque `hoyEn()` sí lance con una zona
 * inválida: el provider se niega a cargar un perfil con una zona que no existe
 * (marca error en el slice), así que lo que llega a este hook ya está validado.
 *
 * OJO al escribir: mientras `error.perfil` esté puesto, el perfil que hay es el
 * default (Guatemala), así que estas funciones devuelven una fecha que puede no
 * ser la del usuario. Una página que GUARDA una fecha tiene que leer
 * `error.perfil` antes, igual que con los montos — de acá salen los límites de
 * mes de todas las consultas.
 */
export function useFechas(): Fechas {
  const { perfil } = useSesion()
  const zona = perfil.zona_horaria

  return useMemo(() => ({
    hoy: () => hoyEn(zona),
    mesActual: () => mesActualEn(zona),
    ahora: () => ahoraEn(zona),
    zona,
  }), [zona])
}
