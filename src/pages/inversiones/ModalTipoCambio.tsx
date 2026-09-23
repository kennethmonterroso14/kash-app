import { useState } from 'react'
import Aviso from '../../components/Aviso'
import Campo from '../../components/Campo'
import Hoja from '../../components/Hoja'
import { toCentavos } from '../../lib/finanzas'
import { IconoAlerta, IconoRecargar } from '../../components/iconos'
import { useMoneda } from '../../hooks/useMoneda'
import { useSesion } from '../../context/sesion'

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
  const fmt = useMoneda()
  const { perfil } = useSesion()
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

  // El estado de la cifra vigente, con icono y no con emoji: el emoji cambia de
  // forma y color según la plataforma, y acá es un indicador, no contenido.
  const estado = !tipoCambioFecha
    ? { aviso: true, texto: 'Sin verificar — confirma el tipo de cambio' }
    : desactualizado
    ? { aviso: true, texto: 'Sin actualizar hace más de 7 días' }
    : { aviso: false, texto: `Actualizado el ${new Date(tipoCambioFecha).toLocaleDateString(perfil.locale, { day: 'numeric', month: 'long' })}` }

  return (
    <Hoja titulo="Tipo de cambio" onCerrar={onCerrar}>
      {/* La cifra vigente, grande y centrada, como el monto de la hoja de alta. */}
      <div className="text-center py-2">
        <p className="text-textDim text-[13px]">1 dólar estadounidense</p>
        <p className="text-text text-[44px] leading-[52px] font-bold tabular-nums tracking-display">{fmt(tipoCambioUSD)}</p>
        <p className={`text-[13px] inline-flex items-center gap-1 ${estado.aviso ? 'text-warning' : 'text-textDim'}`}>
          {estado.aviso && <IconoAlerta size={14} className="shrink-0" />}
          {estado.texto}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Campo
          etiqueta="Nuevo tipo de cambio" placeholder="7.75" inputMode="decimal"
          value={valor} onChange={e => setValor(e.target.value)}
          clase="tabular-nums"
        />
        {err && <Aviso>{err}</Aviso>}
        <button
          onClick={guardarManual}
          disabled={guardando || consultando}
          className="presionable w-full h-12 rounded-full bg-accent text-bg font-semibold text-[15px] disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : 'Guardar tipo de cambio'}
        </button>
        <button
          onClick={desdeAPI}
          disabled={consultando || guardando}
          className="presionable w-full h-12 rounded-full bg-vidrio-relleno text-accent font-semibold text-[15px] inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <IconoRecargar size={18} className={consultando ? 'animate-spin' : ''} />
          {consultando ? 'Consultando...' : 'Usar el tipo de cambio de hoy'}
        </button>
      </div>
    </Hoja>
  )
}
