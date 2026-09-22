// src/components/AlertasBanner.tsx
import { useCallback, useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { calcAlertasTC, type AlertaTC, type TarjetaCredito } from '../lib/finanzas'
import { IconoAlerta, IconoCerrar } from './iconos'
import { useMoneda } from '../hooks/useMoneda'

interface Props { userId: string }

// Layout (y con él este banner) nunca se desmonta durante la sesión, así que sin
// recargas periódicas las alertas se quedan congeladas en el estado que tenían al
// iniciar sesión: una TC ya pagada seguiría mostrando "Pago vencido" y una que
// cruza su día de pago con la pestaña abierta nunca alertaría.
const REFRESCO_MS = 60_000

// La identidad de la alerta incluye el monto (o los días restantes): descartar
// un vencido de Q2,500 no debe silenciar otro monto distinto de la misma TC.
const claveAlerta = (a: AlertaTC): string =>
  `${a.tipo}-${a.tc.id}-${a.monto ?? a.diasRestantes ?? 0}`

export default function AlertasBanner({ userId }: Props) {
  const fmt = useMoneda()
  const [alertas, setAlertas]         = useState<AlertaTC[]>([])
  const [descartadas, setDescartadas] = useState<Set<string>>(new Set())
  const { pathname } = useLocation()

  const cargar = useCallback(async () => {
    if (!userId) return null
    const { data, error } = await supabase
      .from('tarjetas_credito')
      .select('id, nombre, banco, ultimos_4, limite_credito, deuda_actual, deuda_ciclo_anterior, dia_cierre, dia_pago, color, activa')
      .eq('user_id', userId)
      .eq('activa', true)
    if (error) {
      // Las alertas son derivadas: si la consulta falla se conservan las
      // anteriores en lugar de afirmar que no hay ninguna.
      console.error('Error al cargar alertas de TC:', error)
      return null
    }
    return calcAlertasTC((data ?? []) as TarjetaCredito[])
  }, [userId])

  useEffect(() => {
    if (!userId) return
    let ignorar = false

    const refrescar = async () => {
      const nuevas = await cargar()
      if (!ignorar && nuevas) setAlertas(nuevas)
    }

    // Se recarga al montar, en cada navegación (pathname en las deps), al
    // volver a la pestaña y cada REFRESCO_MS — calcAlertasTC depende de la
    // fecha de hoy, no solo de los datos.
    if (pathname) refrescar()
    const timer = window.setInterval(refrescar, REFRESCO_MS)
    const alVolver = () => { if (document.visibilityState === 'visible') refrescar() }
    window.addEventListener('focus', alVolver)
    document.addEventListener('visibilitychange', alVolver)

    return () => {
      ignorar = true
      window.clearInterval(timer)
      window.removeEventListener('focus', alVolver)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [userId, pathname, cargar])

  const descartar = (key: string) =>
    setDescartadas(prev => new Set([...prev, key]))

  const visibles = alertas.filter(a => !descartadas.has(claveAlerta(a)))

  if (visibles.length === 0) return null

  return (
    <div>
      {visibles.map(alerta => {
        const key = claveAlerta(alerta)
        if (alerta.tipo === 'pago_vencido') {
          return (
            <div key={key} className="bg-danger flex justify-between items-center px-4 py-2">
              <span className="text-text text-xs font-semibold flex items-center gap-1.5 min-w-0">
                <IconoAlerta size={14} className="shrink-0" />
                <span className="truncate">Pago vencido en {alerta.tc.nombre}: {fmt(alerta.monto!)}</span>
              </span>
              <button
                onClick={() => descartar(key)}
                aria-label="Descartar alerta"
                className="presionable text-text/80 hover:text-text ml-3 shrink-0"
              >
                <IconoCerrar size={16} />
              </button>
            </div>
          )
        }
        // cierre_proximo
        return (
          <div key={key} className="bg-warning flex justify-between items-center px-4 py-2">
            <span className="text-bg text-xs font-semibold min-w-0 truncate">
              ⏰ {alerta.tc.nombre} cierra en {alerta.diasRestantes} {alerta.diasRestantes === 1 ? 'día' : 'días'}
            </span>
            <button
              onClick={() => descartar(key)}
              aria-label="Descartar alerta"
              className="presionable text-bg/70 hover:text-bg ml-3 shrink-0"
            >
              <IconoCerrar size={16} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
