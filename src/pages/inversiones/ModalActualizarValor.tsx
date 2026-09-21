import { useState } from 'react'
import Campo from '../../components/Campo'
import Hoja from '../../components/Hoja'
import { toCentavos, type Inversion } from '../../lib/finanzas'
import { useMoneda } from '../../hooks/useMoneda'
import { useFechas } from '../../hooks/useFechas'

interface Props {
  inv: Inversion
  actualizarValor: (id: string, valor: number, fecha: string) => Promise<unknown>
  archivar: (id: string) => Promise<unknown>
  onCerrar: () => void
}

export default function ModalActualizarValor({ inv, actualizarValor, archivar, onCerrar }: Props) {
  const fmt = useMoneda()
  const fechas = useFechas()
  const esUSD = inv.moneda === 'USD'

  const [valor, setValor] = useState((inv.valor_actual / 100).toFixed(2))
  const [fecha, setFecha] = useState(fechas.hoy())
  const [guardando, setGuardando] = useState(false)
  // Archivar es destructivo, así que va en 2 taps y NO con window.confirm, que
  // es la convención del repo (y lo que este modal hacía mal).
  const [porConfirmar, setPorConfirmar] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const guardar = async () => {
    setErr(null)
    const val = parseFloat(valor)
    if (isNaN(val) || val < 0)       return setErr('El valor debe ser 0 o mayor')
    if (fecha > fechas.hoy())        return setErr('La fecha no puede ser futura')
    if (fecha < inv.fecha_inicio)    return setErr('La fecha no puede ser anterior al inicio de la inversión')
    try {
      setGuardando(true)
      await actualizarValor(inv.id, toCentavos(val), fecha)
      onCerrar()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error al actualizar')
    } finally {
      setGuardando(false)
    }
  }

  const confirmarArchivado = async () => {
    if (!porConfirmar) {
      setPorConfirmar(true)
      setTimeout(() => setPorConfirmar(false), 3000)
      return
    }
    try {
      setGuardando(true)
      await archivar(inv.id)
      onCerrar()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error al archivar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Hoja titulo={`Actualizar — ${inv.nombre}`} onCerrar={onCerrar}>
      <div className="bg-bg rounded-control p-3">
        <p className="text-textDim text-xs tracking-micro">Valor anterior</p>
        <p className="text-text font-mono">
          {esUSD ? fmt(inv.valor_actual, 'USD') : fmt(inv.valor_actual)}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Campo
          etiqueta={`Nuevo valor (${esUSD ? '$' : 'Q'})`}
          placeholder="0.00" inputMode="decimal"
          value={valor} onChange={e => setValor(e.target.value)}
          clase="font-mono"
        />
        <Campo
          etiqueta="Fecha del update" tipo="date"
          value={fecha} onChange={e => setFecha(e.target.value)}
          min={inv.fecha_inicio} max={fechas.hoy()}
          pista="Una fecha anterior agrega un punto al historial sin reemplazar el valor vigente."
        />

        {err && <p className="text-danger text-sm">{err}</p>}
        <button
          onClick={guardar}
          disabled={guardando}
          className="presionable w-full py-3 rounded-control bg-accent text-bg font-semibold text-sm disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : 'Guardar nuevo valor'}
        </button>
        <button
          onClick={confirmarArchivado}
          disabled={guardando}
          className={`presionable w-full py-2 rounded-control text-xs ${
            porConfirmar ? 'bg-danger/10 text-danger font-semibold' : 'text-danger/70 hover:text-danger'
          }`}
        >
          {porConfirmar
            ? '¿Confirmar archivado? El historial se conserva'
            : 'Archivar inversión'}
        </button>
      </div>
    </Hoja>
  )
}
