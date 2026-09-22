import { useState } from 'react'
import type { TarjetaCredito } from '../../lib/finanzas'
import Aviso from '../../components/Aviso'
import Dialogo from '../../components/Dialogo'
import { useSesion } from '../../context/sesion'
import { useMoneda } from '../../hooks/useMoneda'
import { useFechas } from '../../hooks/useFechas'

interface Props {
  tc: TarjetaCredito
  onCerrar: () => void
}

/**
 * Confirmación de cierre de ciclo: la deuda del ciclo actual pasa a "pendiente
 * de pago" y el actual vuelve a 0. Lo hace el RPC `cerrar_ciclo_tc`.
 */
export default function ModalCerrarCiclo({ tc, onCerrar }: Props) {
  const { cerrarCiclo } = useSesion()
  const fmt = useMoneda()
  const fechas = useFechas()
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Días que faltan para el cierre, sobre el calendario del usuario.
  // NO se usa `resumen.dias_para_cierre`: ese valor nunca es 0 (la fecha
  // próxima es exclusiva) y el día del cierre salta al largo del mes completo,
  // así que el aviso se mostraba siempre y justo ese día decía lo contrario.
  const faltanCierre = (() => {
    const [anio, mes, dia] = fechas.hoy().split('-').map(Number)
    const ultimoDiaMes = new Date(anio, mes, 0).getDate()   // día 0 del mes siguiente
    const diaCierre = Math.min(tc.dia_cierre, ultimoDiaMes)
    return dia < diaCierre ? diaCierre - dia : 0
  })()

  const confirmar = async () => {
    setErr(null)
    try {
      setGuardando(true)
      await cerrarCiclo(tc.id)
      onCerrar()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error al cerrar ciclo')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialogo titulo="¿Cerrar ciclo?" onCerrar={onCerrar}>
      <p className="text-textDim text-sm mb-1">
        Tarjeta: <span className="text-text">{tc.nombre}</span>
      </p>
      <p className="text-textDim text-sm mb-4">
        Cargos del ciclo: <span className="text-text tabular-nums">{fmt(tc.deuda_actual)}</span>
        <br />
        <span className="text-textDim text-xs">
          Al cerrar, esta deuda pasará a "pendiente de pago" y el ciclo actual se reinicia en Q0.
        </span>
      </p>
      {faltanCierre > 0 && (
        <Aviso tono="atencion" clase="mb-3">
          Faltan {faltanCierre} {faltanCierre === 1 ? 'día' : 'días'} para el cierre real de esta
          tarjeta. Si cierras ahora, los cargos que registres después abrirán un ciclo aparte.
        </Aviso>
      )}
      {err && <Aviso clase="mb-3">{err}</Aviso>}
      <div className="flex gap-3">
        <button
          onClick={onCerrar}
          className="presionable flex-1 py-3 rounded-control bg-bg text-textDim text-sm font-semibold hover:text-text"
        >
          Cancelar
        </button>
        <button
          onClick={confirmar}
          disabled={guardando}
          className="presionable flex-1 py-3 rounded-control bg-danger text-text text-sm font-semibold disabled:opacity-50"
        >
          {guardando ? 'Cerrando...' : 'Cerrar ciclo'}
        </button>
      </div>
    </Dialogo>
  )
}
