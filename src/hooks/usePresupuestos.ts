import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useFechas } from './useFechas'

export interface Presupuesto {
  id: string
  categoria: string
  monto_limite: number   // centavos
  mes: string            // 'YYYY-MM-01' — la columna es `date`
}

const COLS = 'id, categoria, monto_limite, mes'
const MS_BANNER = 4000

/** Resultado de la copia automática, para el banner con "Deshacer". */
interface Copia { n: number; ids: string[] }

/**
 * Los presupuestos de UN mes, con la copia automática del mes anterior.
 *
 * Era la única tabla sin hook: sus ~250 líneas de acceso a datos vivían dentro
 * de `BudgetPage`, mezcladas con el JSX. Acá está todo el estado delicado, que
 * conviene leer antes de tocarlo — cada invariante tapa un bug que ya ocurrió:
 *
 * 1. **Todo el estado va etiquetado con su mes** y se expone ya filtrado. Una
 *    respuesta que llega tarde (el usuario ya cambió de mes) no puede pintarse
 *    ni editarse, y cambiar de mes descarta el banner por derivación en lugar
 *    de por un efecto que reinicie estado.
 * 2. **La copia se decide con el resultado del fetch**, no con
 *    `presupuestos.length`. Con la longitud viva, borrar la última tarjeta
 *    volvía a disparar la copia y resucitaba justo lo que se acababa de borrar.
 * 3. **El latch es un ref, no una dependencia del efecto**: escribirlo no
 *    re-renderiza, así que el efecto no se cancela a sí mismo y la copia
 *    alcanza a mostrar el banner.
 * 4. **Solo mes anterior → mes actual.** Sin el guard, avanzar con "→"
 *    materializaba presupuestos en cada mes futuro visitado.
 * 5. **Deshacer deja el latch puesto**, para no re-disparar la copia. Navegar a
 *    otro mes y volver lo reinicia.
 * 6. **Las escrituras van acotadas por `user_id` y `mes`**: un id de otro mes
 *    afecta 0 filas en lugar de reescribir un mes ya cerrado.
 */
export function usePresupuestos(userId: string, mes: string) {
  const fechas = useFechas()
  const mesInicio = `${mes}-01`

  const [estado, setEstado] = useState<{ mes: string; rows: Presupuesto[] }>({ mes: '', rows: [] })
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const [errorEscritura, setErrorEscritura] = useState<{ mes: string; msg: string } | null>(null)
  const [vacioAlCargar, setVacioAlCargar] = useState<{ mes: string; vacio: boolean }>({ mes: '', vacio: false })
  const [copia, setCopia] = useState<{ mes: string; datos: Copia } | null>(null)

  const latchCopia = useRef<string | null>(null)
  const timerBanner = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [generacion, setGeneracion] = useState(0)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('presupuestos')
      .select(COLS)
      .eq('user_id', userId)
      .eq('mes', mesInicio)
      .eq('activo', true)
    if (error) {
      // Un fallo de red no debe verse como "sin presupuestos": eso además
      // armaba la copia automática sobre un mes que sí tenía datos.
      setErrorLectura(error.message)
      return
    }
    const rows = data ?? []
    setErrorLectura(null)
    setEstado({ mes: mesInicio, rows })
    setVacioAlCargar({ mes: mesInicio, vacio: rows.length === 0 })
  }, [userId, mesInicio])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; ver useCuentas
  useEffect(() => { cargar() }, [cargar, generacion])

  useEffect(() => () => {
    if (timerBanner.current) clearTimeout(timerBanner.current)
  }, [])

  // ── Copia automática del mes anterior ──────────────────────────────
  useEffect(() => {
    if (vacioAlCargar.mes !== mesInicio || !vacioAlCargar.vacio) return
    if (latchCopia.current === mesInicio) return
    if (mes > fechas.mesActual()) return          // invariante 4
    latchCopia.current = mesInicio                // invariante 3

    const [anio, mesNum] = mes.split('-').map(Number)
    const prev = new Date(anio, mesNum - 2, 1)
    const mesPrev = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`

    ;(async () => {
      const { data: filasPrev, error: errPrev } = await supabase
        .from('presupuestos')
        .select('categoria, monto_limite')
        .eq('user_id', userId)
        .eq('mes', mesPrev)
        .eq('activo', true)
      if (errPrev) { setErrorEscritura({ mes: mesInicio, msg: errPrev.message }); return }
      if (!filasPrev || filasPrev.length === 0) return

      const { data: insertadas, error: errInsert } = await supabase
        .from('presupuestos')
        .insert(filasPrev.map(r => ({
          user_id: userId,
          categoria: r.categoria,
          monto_limite: r.monto_limite,
          mes: mesInicio,
          activo: true,
        })))
        .select(COLS)
      if (errInsert) { setErrorEscritura({ mes: mesInicio, msg: errInsert.message }); return }
      if (!insertadas || insertadas.length === 0) return

      setEstado(prev => (prev.mes === mesInicio ? { mes: mesInicio, rows: insertadas } : prev))
      setCopia({ mes: mesInicio, datos: { n: insertadas.length, ids: insertadas.map(r => r.id) } })
      if (timerBanner.current) clearTimeout(timerBanner.current)
      timerBanner.current = setTimeout(() => setCopia(null), MS_BANNER)
    })()
  }, [vacioAlCargar, mes, mesInicio, userId, fechas])

  // ── Escrituras ─────────────────────────────────────────────────────
  const agregar = async (categoria: string, centavos: number): Promise<string | null> => {
    const { data, error } = await supabase
      .from('presupuestos')
      .upsert(
        { user_id: userId, categoria, monto_limite: centavos, mes: mesInicio, activo: true },
        { onConflict: 'user_id,categoria,mes' },
      )
      .select(COLS)
      .single()
    if (error) return error.message
    if (data) {
      setEstado(prev => {
        if (prev.mes !== mesInicio) return prev
        const existe = prev.rows.some(p => p.id === data.id)
        return {
          mes: prev.mes,
          rows: existe ? prev.rows.map(p => (p.id === data.id ? data : p)) : [...prev.rows, data],
        }
      })
    }
    return null
  }

  const actualizarLimite = async (id: string, centavos: number): Promise<string | null> => {
    const { data, error } = await supabase
      .from('presupuestos')
      .update({ monto_limite: centavos })
      .eq('id', id)
      .eq('user_id', userId)
      .eq('mes', mesInicio)              // invariante 6
      .select('id')
    if (error) return error.message
    if (!data || data.length === 0) return 'El presupuesto ya no existe en este mes'
    setEstado(prev => (
      prev.mes === mesInicio
        ? { mes: prev.mes, rows: prev.rows.map(p => (p.id === id ? { ...p, monto_limite: centavos } : p)) }
        : prev
    ))
    return null
  }

  const eliminar = async (id: string): Promise<string | null> => {
    const { error } = await supabase
      .from('presupuestos')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .eq('mes', mesInicio)
    if (error) {
      setErrorEscritura({ mes: mesInicio, msg: error.message })
      return error.message
    }
    setEstado(prev => (
      prev.mes === mesInicio
        ? { mes: prev.mes, rows: prev.rows.filter(p => p.id !== id) }
        : prev
    ))
    return null
  }

  const deshacerCopia = async (): Promise<string | null> => {
    const visible = copia?.mes === mesInicio ? copia.datos : null
    if (!visible) return null
    if (timerBanner.current) {
      clearTimeout(timerBanner.current)
      timerBanner.current = null
    }
    const { error } = await supabase
      .from('presupuestos')
      .delete()
      .in('id', visible.ids)
      .eq('user_id', userId)
    if (error) {
      setErrorEscritura({ mes: mesInicio, msg: error.message })
      return error.message
    }
    setEstado(prev => (prev.mes === mesInicio ? { mes: prev.mes, rows: [] } : prev))
    setCopia(null)
    latchCopia.current = mesInicio          // invariante 5
    return null
  }

  return {
    presupuestos: useMemo(
      () => (estado.mes === mesInicio ? estado.rows : []),
      [estado, mesInicio],
    ),
    // Derivado: mientras el mes pedido y el cargado no coincidan. Evita el
    // frame en que se ven las tarjetas del mes anterior bajo el mes nuevo.
    cargando: estado.mes !== mesInicio && !errorLectura,
    errorLectura,
    errorEscritura: errorEscritura?.mes === mesInicio ? errorEscritura.msg : null,
    limpiarErrorEscritura: () => setErrorEscritura(null),
    banner: copia?.mes === mesInicio ? copia.datos : null,
    agregar,
    actualizarLimite,
    eliminar,
    deshacerCopia,
    recargar: () => setGeneracion(g => g + 1),
  }
}
