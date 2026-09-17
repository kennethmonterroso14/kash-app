import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { hoyGT } from '../lib/constants'

// Tope de periodos a recuperar por pago, para que una cuenta dormida
// no genere un lote de inserts sin límite.
const MAX_PERIODOS = 12

/**
 * Runs once per session per usuario cuando userId está disponible.
 * Para cada pago_recurrente activo:
 *   - calcula el último vencimiento ya pasado (dia_del_mes de este mes si ya
 *     llegó, si no el del mes anterior) en calendario Guatemala
 *   - inserta un gasto por CADA vencimiento posterior a ultima_aplicacion
 *     (hasta MAX_PERIODOS), con fecha = el vencimiento, para que el gasto
 *     caiga en el mes al que pertenece
 *   - deja ultima_aplicacion en el vencimiento más reciente aplicado
 * Un pago sin ultima_aplicacion solo aplica el vencimiento de este mes si ya
 * pasó: nunca se rellena historia de un pago recién creado.
 */
export function useAutoApplyPagos(userId: string | undefined) {
  // Se llavea al usuario: App queda montado entre sign-out y sign-in, así que
  // un useRef(false) dejaría al siguiente usuario sin aplicar sus pagos.
  const appliedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!userId || appliedFor.current === userId) return
    // Se marca ANTES del trabajo async: StrictMode invoca el efecto dos veces
    // y un guard tardío insertaría las transacciones duplicadas.
    appliedFor.current = userId

    const today = hoyGT()                        // YYYY-MM-DD (GT)
    const todayDay = parseInt(today.split('-')[2], 10)
    const [anio, mesNum] = today.split('-').map(Number)   // mesNum es 1-based

    // dia_del_mes está restringido a 1-28, así que no hace falta recortar
    // por la longitud del mes.
    const vencimientoEn = (mesIndex: number, dia: number) => {
      const d = new Date(anio, mesIndex, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    }

    supabase
      .from('pagos_recurrentes')
      .select('id, nombre, monto, dia_del_mes, cuenta_id, categoria, ultima_aplicacion')
      .eq('user_id', userId)
      .eq('activo', true)
      .then(async ({ data: pagos, error: pagosError }) => {
        if (pagosError) {
          console.error('[AutoApply] Error leyendo pagos recurrentes:', pagosError.message)
          appliedFor.current = null   // permitir reintento
          return
        }
        if (!pagos?.length) return

        try {
          const rows: {
            user_id: string
            cuenta_id: string
            fecha: string
            cantidad: number
            descripcion: string
            categoria: string
            tipo: 'gasto'
          }[] = []
          const nuevaUltima: Record<string, string> = {}

          pagos.forEach(p => {
            // Índice de mes (0-based) del último vencimiento ya pasado
            const baseMes = p.dia_del_mes <= todayDay ? mesNum - 1 : mesNum - 2

            const vencimientos: string[] = []
            if (!p.ultima_aplicacion) {
              // Pago nuevo: solo este mes, y solo si el día ya pasó
              if (p.dia_del_mes <= todayDay) {
                vencimientos.push(vencimientoEn(mesNum - 1, p.dia_del_mes))
              }
            } else {
              // Recuperar todos los vencimientos perdidos, del más reciente
              // hacia atrás, hasta llegar a ultima_aplicacion
              for (let i = 0; i < MAX_PERIODOS; i++) {
                const venc = vencimientoEn(baseMes - i, p.dia_del_mes)
                if (venc <= p.ultima_aplicacion) break
                vencimientos.push(venc)
              }
            }

            if (!vencimientos.length) return
            if (vencimientos.length === MAX_PERIODOS) {
              // Se topó el lote: los vencimientos más viejos quedan sin aplicar
              // y ultima_aplicacion salta al más reciente, así que no se
              // recuperan solos. Avisar en lugar de truncar en silencio.
              console.warn(
                `[AutoApply] "${p.nombre}": se aplicaron ${MAX_PERIODOS} periodos (tope). ` +
                'Los vencimientos anteriores quedan sin registrar; agrégalos a mano si corresponde.',
              )
            }
            nuevaUltima[p.id] = vencimientos[0]   // el más reciente
            vencimientos.forEach(fecha => {
              rows.push({
                user_id: userId,
                cuenta_id: p.cuenta_id,
                fecha,
                cantidad: -p.monto,   // gasto → negativo
                descripcion: p.nombre,
                categoria: p.categoria,
                tipo: 'gasto',
              })
            })
          })

          if (!rows.length) return

          const { error: txnError } = await supabase
            .from('transacciones')
            .insert(rows)

          if (txnError) {
            console.error('[AutoApply] Error insertando transacciones:', txnError.message)
            appliedFor.current = null   // permitir reintento
            return
          }

          // Update ultima_aplicacion al último vencimiento aplicado (no a hoy).
          // Si esto falla hay que saberlo: las transacciones YA se insertaron, así
          // que un pago cuyo ultima_aplicacion no avanzó se vuelve a aplicar en la
          // siguiente carga y duplica el gasto. No se reintenta en automático
          // (reintentar el insert es justo lo que hay que evitar); se registra
          // para que el duplicado sea diagnosticable.
          const updates = await Promise.all(
            Object.entries(nuevaUltima).map(async ([id, fecha]) => {
              const { error } = await supabase
                .from('pagos_recurrentes')
                .update({ ultima_aplicacion: fecha })
                .eq('id', id)
                .eq('user_id', userId)
              return { id, error }
            })
          )
          const fallidos = updates.filter(u => u.error)
          if (fallidos.length) {
            console.error(
              '[AutoApply] Transacciones insertadas pero no se pudo avanzar ultima_aplicacion en ' +
              `${fallidos.length} pago(s): ${fallidos.map(f => `${f.id} (${f.error?.message})`).join('; ')}. ` +
              'Se volverán a aplicar en la próxima carga: revisa duplicados.',
            )
          }
        } catch (e) {
          console.error('[AutoApply] Error inesperado:', e)
          appliedFor.current = null   // permitir reintento
        }
      })
  }, [userId])
}
