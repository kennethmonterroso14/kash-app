// src/components/AlertasBanner.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { calcAlertasTC, formatQ, type AlertaTC, type TarjetaCredito } from '../lib/finanzas'

interface Props { userId: string }

export default function AlertasBanner({ userId }: Props) {
  const [alertas, setAlertas]         = useState<AlertaTC[]>([])
  const [descartadas, setDescartadas] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!userId) return
    supabase
      .from('tarjetas_credito')
      .select('id, nombre, banco, ultimos_4, limite_credito, deuda_actual, deuda_ciclo_anterior, dia_cierre, dia_pago, color, activa')
      .eq('user_id', userId)
      .eq('activa', true)
      .then(({ data }) => {
        if (!data) return
        const tcs = data as TarjetaCredito[]
        setAlertas(calcAlertasTC(tcs))
      })
  }, [userId])

  const descartar = (key: string) =>
    setDescartadas(prev => new Set([...prev, key]))

  const visibles = alertas.filter(a => {
    const key = `${a.tipo}-${a.tc.id}`
    return !descartadas.has(key)
  })

  if (visibles.length === 0) return null

  return (
    <div>
      {visibles.map(alerta => {
        const key = `${alerta.tipo}-${alerta.tc.id}`
        if (alerta.tipo === 'pago_vencido') {
          return (
            <div key={key} className="bg-danger flex justify-between items-center px-4 py-2">
              <span className="text-white text-xs font-semibold">
                ⚠ Pago vencido en {alerta.tc.nombre}: {formatQ(alerta.monto!)}
              </span>
              <button
                onClick={() => descartar(key)}
                className="text-white/80 hover:text-white ml-3 text-base leading-none"
              >
                ✕
              </button>
            </div>
          )
        }
        // cierre_proximo
        return (
          <div key={key} className="bg-warning flex justify-between items-center px-4 py-2">
            <span className="text-bg text-xs font-semibold">
              ⏰ {alerta.tc.nombre} cierra en {alerta.diasRestantes} {alerta.diasRestantes === 1 ? 'día' : 'días'}
            </span>
            <button
              onClick={() => descartar(key)}
              className="text-bg/70 hover:text-bg ml-3 text-base leading-none"
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
