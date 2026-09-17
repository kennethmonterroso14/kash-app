import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { hoyGT } from '../lib/constants'

/**
 * Aplica los pagos fijos vencidos, una vez por sesión y por usuario.
 *
 * Reglas, en orden de importancia:
 *
 * 1. COMO MÁXIMO UN PERIODO POR PAGO Y POR CORRIDA, el más reciente ya
 *    vencido. Recuperar automáticamente los meses perdidos significa insertar
 *    gastos retroactivos con fecha en meses ya cerrados, sin confirmación y
 *    sin deshacer: quien no abre la app medio año se encontraría el saldo
 *    hundido y todos sus presupuestos históricos en rojo. Recuperar el atraso
 *    es una función con UI propia (listar los vencimientos y confirmar), no
 *    algo que deba pasar solo al abrir la app.
 * 2. La idempotencia se evalúa POR MES, no por fecha exacta: si se edita
 *    `dia_del_mes`, el vencimiento nuevo ordena después del guardado y el mes
 *    se aplicaría dos veces.
 * 3. El gasto se fecha EN EL VENCIMIENTO, no hoy, para que caiga en el mes al
 *    que pertenece.
 * 4. Nunca antes de que el pago existiera (`created_at`).
 * 5. Se avanza `ultima_aplicacion` con compare-and-swap ANTES de insertar: si
 *    dos pestañas corren a la vez, una pierde el swap y no inserta. Ante una
 *    falla se prefiere no aplicar el pago (recuperable a mano) sobre
 *    duplicarlo (que descuadra el saldo y hay que cazar fila por fila).
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

    const hoy = hoyGT()                                   // YYYY-MM-DD (GT)
    const diaHoy = parseInt(hoy.split('-')[2], 10)
    const [anio, mesNum] = hoy.split('-').map(Number)     // mesNum es 1-based

    // El día se recorta al último real del mes destino. La UI solo ofrece 1-28,
    // pero la tabla en producción tiene `dia_del_mes integer` y no se puede dar
    // por hecho que exista el check 1-28: con un 31 guardado, pegar el día a un
    // `YYYY-MM` produciría '2026-02-31', que Postgres rechaza, y el pago no se
    // aplicaría nunca.
    const vencimientoEn = (mesIndex: number, dia: number) => {
      const d = new Date(anio, mesIndex, 1)
      const a = d.getFullYear()
      const m = d.getMonth() + 1
      const ultimoDia = new Date(a, m, 0).getDate()
      const diaReal = Math.min(dia, ultimoDia)
      return `${a}-${String(m).padStart(2, '0')}-${String(diaReal).padStart(2, '0')}`
    }

    ;(async () => {
      const { data: pagos, error: pagosError } = await supabase
        .from('pagos_recurrentes')
        .select('id, nombre, monto, dia_del_mes, cuenta_id, categoria, ultima_aplicacion, created_at')
        .eq('user_id', userId)
        .eq('activo', true)

      if (pagosError) {
        console.error('[AutoApply] Error leyendo pagos recurrentes:', pagosError.message)
        appliedFor.current = null   // permitir reintento
        return
      }
      if (!pagos?.length) return

      for (const p of pagos) {
        // Último vencimiento ya pasado: este mes si el día ya llegó, si no el
        // del mes anterior. El día se compara recortado al mes en curso, para
        // que un dia_del_mes 31 en febrero cuente como vencido el día 28 y no
        // se corra un mes entero.
        const ultimoDiaEsteMes = new Date(anio, mesNum, 0).getDate()
        const vencEsteMes = Math.min(p.dia_del_mes, ultimoDiaEsteMes)
        const venc = vencEsteMes <= diaHoy
          ? vencimientoEn(mesNum - 1, p.dia_del_mes)
          : vencimientoEn(mesNum - 2, p.dia_del_mes)

        // Ya aplicado este mes (comparación por mes, ver regla 2).
        if (p.ultima_aplicacion && venc.substring(0, 7) <= p.ultima_aplicacion.substring(0, 7)) continue
        // El pago no existía en ese vencimiento.
        if (p.created_at && venc < p.created_at.substring(0, 10)) continue

        // Compare-and-swap: la condición incluye el valor que leímos, así que
        // si otra pestaña ya avanzó este pago, el update afecta 0 filas y solo
        // una corrida llega a insertar el gasto.
        const cas = supabase
          .from('pagos_recurrentes')
          .update({ ultima_aplicacion: venc })
          .eq('id', p.id)
          .eq('user_id', userId)
        const swap = p.ultima_aplicacion === null
          ? await cas.is('ultima_aplicacion', null).select('id')
          : await cas.eq('ultima_aplicacion', p.ultima_aplicacion).select('id')

        if (swap.error) {
          console.error(`[AutoApply] "${p.nombre}": no se pudo marcar el vencimiento:`, swap.error.message)
          continue
        }
        if (!swap.data?.length) continue   // otra pestaña/sesión ya lo aplicó

        const { error: txnError } = await supabase
          .from('transacciones')
          .insert({
            user_id:     userId,
            cuenta_id:   p.cuenta_id,
            fecha:       venc,
            cantidad:    -p.monto,   // gasto → negativo
            descripcion: p.nombre,
            categoria:   p.categoria,
            tipo:        'gasto',
          })

        if (txnError) {
          // Revertir el avance para que se reintente en la próxima carga. Si
          // esta reversión también falla, el pago queda marcado sin gasto: se
          // registra explícitamente porque hay que agregarlo a mano.
          const { error: revertError } = await supabase
            .from('pagos_recurrentes')
            .update({ ultima_aplicacion: p.ultima_aplicacion })
            .eq('id', p.id)
            .eq('user_id', userId)
          console.error(
            `[AutoApply] "${p.nombre}": falló el gasto de ${venc} (${txnError.message}).` +
            (revertError
              ? ` Además no se pudo revertir la marca (${revertError.message}): el pago quedó marcado como aplicado SIN gasto, agregalo a mano.`
              : ' Se reintentará en la próxima carga.'),
          )
        }
      }
    })().catch(e => {
      console.error('[AutoApply] Error inesperado:', e)
      appliedFor.current = null   // permitir reintento
    })
  }, [userId])
}
