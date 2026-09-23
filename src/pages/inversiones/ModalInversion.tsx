import { useState } from 'react'
import Aviso from '../../components/Aviso'
import Campo from '../../components/Campo'
import Hoja from '../../components/Hoja'
import { toCentavos, type Inversion } from '../../lib/finanzas'
import { TIPOS_INVERSION } from '../../lib/constants'
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
        <Campo
          etiqueta="Nombre" placeholder={editando ? undefined : 'ej. Fondo HAPI'}
          value={nombre} onChange={e => setNombre(e.target.value)}
        />
        <Campo
          etiqueta="Plataforma (opcional)"
          placeholder={editando ? undefined : 'ej. HAPI, SAT, Binance'}
          value={plataforma} onChange={e => setPlataforma(e.target.value)}
        />
        <Campo etiqueta="Tipo de inversión" tipo="select" value={tipo} onChange={e => setTipo(e.target.value)}>
          {TIPOS_INVERSION.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Campo>

        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Campo
              etiqueta={`Capital inicial (${moneda === 'USD' ? 'USD $' : 'GTQ Q'})`}
              placeholder="0.00" inputMode="decimal"
              value={capital} onChange={e => setCapital(e.target.value)}
              clase="tabular-nums"
            />
          </div>
          {editando ? (
            <div className="flex items-center px-4 py-3 bg-vidrio-relleno border border-canto rounded-control text-textDim text-sm font-medium">
              {moneda}
            </div>
          ) : (
            <div className="flex bg-vidrio-relleno border border-canto rounded-control overflow-hidden">
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

        <Campo
          etiqueta="Fecha de inicio" tipo="date" max={fechas.hoy()}
          value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
        />

        <Campo
          etiqueta="Notas (opcional)" tipo="area" rows={2}
          value={notas} onChange={e => setNotas(e.target.value)}
        />

        {err && <Aviso>{err}</Aviso>}
        <button
          onClick={guardar}
          disabled={guardando}
          className="presionable w-full h-12 rounded-full bg-accent text-bg font-semibold text-sm disabled:opacity-50 mt-1"
        >
          {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Agregar inversión'}
        </button>
      </div>
    </Hoja>
  )
}
