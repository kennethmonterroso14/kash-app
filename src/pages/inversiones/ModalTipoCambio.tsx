import { useState } from 'react'
import Aviso from '../../components/Aviso'
import Campo from '../../components/Campo'
import Hoja from '../../components/Hoja'
import { toCentavos } from '../../lib/finanzas'

interface Props {
  /** Centavos de la moneda del perfil por 1 USD (775 = Q7.75). */
  tipoCambioUSD: number
  /** ISO de la última actualización, o null si nunca se verificó. */
  tipoCambioFecha: string | null
  desactualizado: boolean
  guardar: (centavos: number) => Promise<unknown>
  /** Consulta la API y YA persiste el valor; devuelve los centavos guardados. */
  consultarAPI: () => Promise<number>
  onCerrar: () => void
}

export default function ModalTipoCambio({
  tipoCambioUSD, tipoCambioFecha, desactualizado, guardar, consultarAPI, onCerrar,
}: Props) {
  const [valor, setValor] = useState((tipoCambioUSD / 100).toFixed(2))
  const [guardando, setGuardando] = useState(false)
  const [consultando, setConsultando] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const guardarManual = async () => {
    setErr(null)
    const cambio = parseFloat(valor)
    if (isNaN(cambio) || cambio <= 0) return setErr('Ingresa un tipo de cambio válido (ej: 7.75)')
    try {
      setGuardando(true)
      await guardar(toCentavos(cambio))   // 7.75 → 775 centavos
      onCerrar()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error al actualizar')
    } finally {
      setGuardando(false)
    }
  }

  const desdeAPI = async () => {
    setErr(null)
    setConsultando(true)
    try {
      // `consultarAPI` guarda por dentro, así que acá solo se cierra.
      await consultarAPI()
      onCerrar()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error al obtener tipo de cambio')
    } finally {
      setConsultando(false)
    }
  }

  return (
    <Hoja titulo="Tipo de cambio USD" onCerrar={onCerrar}>
      <div className="bg-bg rounded-control p-3">
        <p className="text-textDim text-xs tracking-micro">Tipo de cambio actual</p>
        <p className="text-text font-mono">Q{(tipoCambioUSD / 100).toFixed(2)} por USD</p>
        <p className={`text-xs mt-0.5 ${desactualizado ? 'text-warning' : 'text-textDim'}`}>
          {!tipoCambioFecha
            ? '⚠️ Sin verificar — confirma el tipo de cambio'
            : desactualizado
            ? '⚠️ Sin actualizar hace más de 7 días'
            : `Actualizado: ${new Date(tipoCambioFecha).toLocaleDateString('es-GT')}`}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Campo
          etiqueta="Nuevo tipo de cambio" placeholder="7.75" inputMode="decimal"
          value={valor} onChange={e => setValor(e.target.value)}
          clase="font-mono"
        />
        {err && <Aviso>{err}</Aviso>}
        <button
          onClick={desdeAPI}
          disabled={consultando || guardando}
          className="presionable w-full py-3 rounded-control bg-surface2 text-text text-sm disabled:opacity-50"
        >
          {consultando ? 'Consultando...' : '📡 Obtener tipo actual (API)'}
        </button>
        <button
          onClick={guardarManual}
          disabled={guardando || consultando}
          className="presionable w-full py-3 rounded-control bg-accent text-bg font-semibold text-sm disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : 'Actualizar tipo de cambio'}
        </button>
      </div>
    </Hoja>
  )
}
