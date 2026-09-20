import { useState } from 'react'
import { toCentavos, type Inversion } from '../../lib/finanzas'
import { CLASE_INPUT } from '../../lib/clasesUI'
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
    <div className="fixed inset-0 scrim flex items-end z-50">
      <div className="vidrio-hoja w-full rounded-t-hoja p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
        <div className="flex justify-between items-center mb-5 gap-2">
          <h2 className="text-text font-semibold tracking-titulo truncate">Actualizar — {inv.nombre}</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="presionable text-textDim hover:text-text text-lg flex-shrink-0">✕</button>
        </div>

        <div className="bg-bg rounded-control p-3 mb-4">
          <p className="text-textDim text-xs tracking-micro">Valor anterior</p>
          <p className="text-text font-mono">
            {esUSD ? fmt(inv.valor_actual, 'USD') : fmt(inv.valor_actual)}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <input
            placeholder={`Nuevo valor (${esUSD ? '$' : 'Q'})`}
            value={valor} onChange={e => setValor(e.target.value)}
            inputMode="decimal"
            className={CLASE_INPUT}
          />
          <div>
            <label htmlFor="inv-fecha-update" className="text-textDim text-xs mb-1 block tracking-micro">
              Fecha del update
            </label>
            <input
              id="inv-fecha-update" type="date"
              value={fecha} onChange={e => setFecha(e.target.value)}
              min={inv.fecha_inicio} max={fechas.hoy()}
              className={`w-full ${CLASE_INPUT}`}
            />
            <p className="text-textDim text-xs mt-1">
              Una fecha anterior agrega un punto al historial sin reemplazar el valor vigente.
            </p>
          </div>

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
      </div>
    </div>
  )
}
