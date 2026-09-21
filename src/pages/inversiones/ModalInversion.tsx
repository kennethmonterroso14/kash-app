import { useState } from 'react'
import Hoja from '../../components/Hoja'
import { toCentavos, type Inversion } from '../../lib/finanzas'
import { TIPOS_INVERSION } from '../../lib/constants'
import { CLASE_INPUT } from '../../lib/clasesUI'
import { useFechas } from '../../hooks/useFechas'

interface Props {
  /** En edición viene la inversión; en alta no. */
  inv?: Inversion
  agregar: (input: {
    nombre: string; plataforma?: string; tipo: string; monto_invertido: number
    moneda: 'GTQ' | 'USD'; fecha_inicio: string; notas?: string
  }) => Promise<unknown>
  actualizar: (id: string, updates: {
    nombre: string; plataforma?: string; tipo: string; monto_invertido: number
    fecha_inicio: string; notas?: string
  }) => Promise<unknown>
  onCerrar: () => void
}

/**
 * Alta y edición de una inversión, en UN componente: el formulario estaba
 * copiado dos veces (~90 líneas cada uno) con la misma validación.
 *
 * La única diferencia real es la MONEDA: al crear se elige, al editar es de
 * solo lectura, porque el capital, el valor actual y todo el historial están
 * guardados en la moneda original y cambiarla los reinterpretaría en silencio.
 */
export default function ModalInversion({ inv, agregar, actualizar, onCerrar }: Props) {
  const fechas = useFechas()
  const editando = !!inv

  const [nombre, setNombre]         = useState(inv?.nombre ?? '')
  const [plataforma, setPlataforma] = useState(inv?.plataforma ?? '')
  const [tipo, setTipo]             = useState(inv?.tipo ?? TIPOS_INVERSION[0].value)
  const [capital, setCapital]       = useState(inv ? (inv.monto_invertido / 100).toFixed(2) : '')
  const [moneda, setMoneda]         = useState<'GTQ' | 'USD'>(inv?.moneda ?? 'GTQ')
  const [fechaInicio, setFechaInicio] = useState(inv?.fecha_inicio ?? fechas.hoy())
  const [notas, setNotas]           = useState(inv?.notas ?? '')
  const [guardando, setGuardando]   = useState(false)
  const [err, setErr]               = useState<string | null>(null)

  const guardar = async () => {
    setErr(null)
    const cap = parseFloat(capital)
    if (!nombre.trim())         return setErr('El nombre es requerido')
    if (isNaN(cap) || cap <= 0) return setErr('El capital debe ser mayor a 0')

    const campos = {
      nombre:          nombre.trim(),
      plataforma:      plataforma.trim() || undefined,
      tipo,
      monto_invertido: toCentavos(cap),
      fecha_inicio:    fechaInicio,
      notas:           notas.trim() || undefined,
    }
    try {
      setGuardando(true)
      if (inv) await actualizar(inv.id, campos)
      else     await agregar({ ...campos, moneda })
      onCerrar()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Hoja titulo={editando ? 'Editar inversión' : 'Nueva inversión'} onCerrar={onCerrar}>
      <div className="flex flex-col gap-3">
        <input
          placeholder={editando ? 'Nombre' : 'Nombre (ej: Fondo HAPI)'}
          value={nombre} onChange={e => setNombre(e.target.value)}
          className={CLASE_INPUT}
        />
        <input
          placeholder={editando ? 'Plataforma (opcional)' : 'Plataforma (opcional, ej: HAPI, SAT, Binance)'}
          value={plataforma} onChange={e => setPlataforma(e.target.value)}
          className={CLASE_INPUT}
        />
        <select value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo de inversión" className={CLASE_INPUT}>
          {TIPOS_INVERSION.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        <div className="flex gap-2">
          <input
            placeholder={`Capital inicial (${moneda === 'USD' ? 'USD $' : 'GTQ Q'})`}
            value={capital} onChange={e => setCapital(e.target.value)}
            inputMode="decimal"
            className={`flex-1 ${CLASE_INPUT}`}
          />
          {editando ? (
            <div className="flex items-center px-4 py-3 bg-surface2 border border-canto rounded-control text-textDim text-sm font-medium">
              {moneda}
            </div>
          ) : (
            <div className="flex bg-bg border border-canto rounded-control overflow-hidden">
              {(['GTQ', 'USD'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMoneda(m)}
                  className={`presionable px-3 py-3 text-sm font-medium ${
                    moneda === m ? 'bg-accent text-bg font-semibold' : 'text-textDim hover:text-text'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
        {editando && (
          <p className="text-textDim text-xs -mt-1">
            La moneda no se puede cambiar: el capital y el historial están guardados en {moneda}.
          </p>
        )}

        <div>
          <label htmlFor="inv-fecha" className="text-textDim text-xs mb-1 block tracking-micro">
            Fecha de inicio
          </label>
          <input
            id="inv-fecha" type="date" max={fechas.hoy()}
            value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
            className={`w-full ${CLASE_INPUT}`}
          />
        </div>

        <textarea
          placeholder="Notas (opcional)"
          value={notas} onChange={e => setNotas(e.target.value)}
          rows={2}
          className={`resize-none ${CLASE_INPUT}`}
        />

        {err && <p className="text-danger text-sm">{err}</p>}
        <button
          onClick={guardar}
          disabled={guardando}
          className="presionable w-full py-3 rounded-control bg-accent text-bg font-semibold text-sm disabled:opacity-50 mt-1"
        >
          {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Agregar inversión'}
        </button>
      </div>
    </Hoja>
  )
}
