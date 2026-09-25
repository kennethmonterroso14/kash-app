import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface PagoPorCategorizar {
  id: string              // el de la transacción
  fecha: string
  cantidad: number        // centavos, negativo
  descripcion: string     // el comercio
  categoria: string       // la sugerida, ya puesta
  tipo: 'gasto' | 'gasto_tc'
  /** El nombre de la tarjeta en Wallet, sacado de "Apple Pay · <tarjeta>". */
  tarjeta: string | null
}

interface Fila {
  transaccion_id: string
  transacciones: {
    id: string; fecha: string; cantidad: number; descripcion: string
    categoria: string; tipo: 'gasto' | 'gasto_tc'; notas: string | null
  } | null
}

const tarjetaDe = (notas: string | null) => notas?.match(/^Apple Pay · (.+)$/)?.[1] ?? null

/**
 * Los pagos de Apple Pay que llegaron por el atajo y esperan categoría
 * (`pagos_por_categorizar`, schema.sql). Lo monta el aviso global del Layout,
 * que no se desmonta: por eso se recarga al volver a la app — los pagos llegan
 * mientras está cerrada.
 *
 * Sin la migración la tabla no existe: eso es "no hay pendientes", no un error
 * que mostrar (la función entera depende de haberla aplicado).
 */
export function usePorCategorizar(userId: string, generacionTxns: number) {
  const [pendientes, setPendientes] = useState<PagoPorCategorizar[]>([])
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!userId) return
    let ignorar = false
    const cargar = async () => {
      const { data, error } = await supabase
        .from('pagos_por_categorizar')
        .select('transaccion_id, transacciones(id, fecha, cantidad, descripcion, categoria, tipo, notas)')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
      if (ignorar || error) return   // un fallo conserva lo que había: es un aviso, no una cifra
      setPendientes(((data ?? []) as unknown as Fila[])
        .filter(f => f.transacciones)
        .map(f => {
          const t = f.transacciones!
          return { id: t.id, fecha: t.fecha, cantidad: t.cantidad, descripcion: t.descripcion,
            categoria: t.categoria, tipo: t.tipo, tarjeta: tarjetaDe(t.notas) }
        }))
    }
    void cargar()
    const alVolver = () => { if (document.visibilityState === 'visible') void cargar() }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    return () => {
      ignorar = true
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
    }
  }, [userId, recarga, generacionTxns])

  /** Devuelve el mensaje de error para mostrar, o null si salió bien. */
  const categorizar = useCallback(async (id: string, categoria: string): Promise<string | null> => {
    const { data, error } = await supabase.rpc('categorizar_pago', { p_transaccion_id: id, p_categoria: categoria })
    if (error || data !== true) return 'No se pudo guardar la categoría. Revisa tu conexión e intenta de nuevo.'
    setPendientes(prev => prev.filter(p => p.id !== id))
    return null
  }, [])

  const recargar = useCallback(() => setRecarga(n => n + 1), [])

  return { pendientes, categorizar, recargar }
}
