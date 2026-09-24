import { supabase } from './supabase'
import { crearCuentaConSaldoEn, type Alta } from './altaCuentaEn'

/** `crearCuentaConSaldoEn` con el cliente del navegador. La lógica y su porqué viven allá. */
export const crearCuentaConSaldo = (alta: Alta): Promise<string | null> =>
  crearCuentaConSaldoEn(supabase, alta)
