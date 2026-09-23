// src/components/AlertasBanner.tsx
import { useCallback, useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { calcAlertasTC, type AlertaTC, type TarjetaCredito } from '../lib/finanzas'
import { IconoAlerta, IconoCerrar, IconoReloj } from './iconos'
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

  // Una tarjeta de vidrio con una fila por alerta, como una notificación
  // agrupada de iOS, dentro del margen de la página. Antes eran franjas
  // naranjas y rojas de borde a borde con un emoji: el único bloque de color
  // plano de la app, y leía como un error del sistema más que como un aviso.
  return (
    <section aria-label="Alertas de tarjetas" className="max-w-lg mx-auto px-4 pt-3">
      <ul className="vidrio-panel rounded-tarjeta px-3">
        {visibles.map(alerta => {
          const key = claveAlerta(alerta)
          const vencido = alerta.tipo === 'pago_vencido'
          const dias = alerta.diasRestantes ?? 0
          // El nombre arriba y el plazo abajo: con el plazo en el título, un
          // nombre largo ("Mastercard BAC Estudiante") lo cortaba justo en la
          // parte que importa.
          const titulo = alerta.tc.nombre
          const detalle = vencido
            ? `Pago vencido · ${fmt(alerta.monto!)}`
            : `Cierra ${dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`} · corte el día ${alerta.tc.dia_cierre}`
          return (
            <li key={key} className="flex items-center gap-3 py-2.5 border-t border-perimetro first:border-t-0">
              <Link to="/tarjetas" className="presionable flex items-center gap-3 flex-1 min-w-0">
                <span
                  aria-hidden="true"
                  className={`grid place-items-center w-9 h-9 rounded-[10px] shrink-0 ${
                    vencido ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning'
                  }`}
                >
                  {vencido ? <IconoAlerta size={19} /> : <IconoReloj size={19} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-text text-[15px] font-semibold truncate">{titulo}</span>
                  <span className={`block text-[13px] truncate ${vencido ? 'text-danger' : 'text-textDim'}`}>{detalle}</span>
                </span>
              </Link>
              <button
                onClick={() => descartar(key)}
                aria-label={`Descartar alerta de ${titulo}`}
                className="presionable grid place-items-center w-7 h-7 rounded-full bg-vidrio-relleno text-textDim shrink-0"
              >
                <IconoCerrar size={13} />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
