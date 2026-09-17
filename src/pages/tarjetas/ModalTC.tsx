import { useState } from 'react'
import { toCentavos, type TarjetaCredito } from '../../lib/finanzas'
import { CLASE_INPUT } from '../../lib/clasesUI'
import { useSesion } from '../../context/sesion'

// Los colores que el usuario le puede poner a una tarjeta. Son data (se guardan
// en la fila), no decoración: no cambian si cambia el tema.
const COLORES_TC = [
  '#7c6af7', '#4ade80', '#f87171', '#fbbf24',
  '#60a5fa', '#f472b6', '#34d399', '#fb923c',
]

interface Props {
  /** En 'editar' viene la tarjeta; en 'nueva' no. */
  tc?: TarjetaCredito
  onCerrar: () => void
}

/**
 * Alta y edición de una tarjeta. Es UN componente para los dos casos porque el
 * formulario era idéntico y estaba copiado dos veces en la página: 180 líneas
 * duplicadas donde cualquier arreglo había que hacerlo dos veces.
 *
 * El estado del formulario vive acá y se inicializa de `tc`. Antes lo hacían
 * unos helpers `abrirNuevaTC`/`abrirEditarTC` que reseteaban nueve `useState`
 * a mano; al montarse el modal cuando se abre, el reset es el montaje.
 */
export default function ModalTC({ tc, onCerrar }: Props) {
  const { agregarTC, actualizarTC, archivarTC } = useSesion()
  const editando = !!tc

  const [nombre, setNombre] = useState(tc?.nombre ?? '')
  const [banco,  setBanco]  = useState(tc?.banco ?? '')
  const [ult4,   setUlt4]   = useState(tc?.ultimos_4 ?? '')
  const [limite, setLimite] = useState(tc ? (tc.limite_credito / 100).toFixed(2) : '')
  const [cierre, setCierre] = useState(tc ? String(tc.dia_cierre) : '')
  const [pago,   setPago]   = useState(tc ? String(tc.dia_pago) : '')
  const [color,  setColor]  = useState(tc?.color ?? COLORES_TC[0])
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Si el día de pago cae antes del cierre, el pago es del mes siguiente
  // (ej: cierre 24, pago 21 → ~27 días), así que eso siempre es válido.
  const validarFechas = (cie: number, pag: number): string | null =>
    pag >= cie && pag < cie + 5
      ? 'El día de pago debe ser al menos 5 días después del cierre (o en el mes siguiente)'
      : null

  const guardar = async () => {
    setErr(null)
    const lim = parseFloat(limite)
    const cie = parseInt(cierre)
    const pag = parseInt(pago)
    if (!nombre.trim())                    return setErr('El nombre es requerido')
    if (isNaN(lim) || lim <= 0)            return setErr('El límite debe ser mayor a Q0')
    if (isNaN(cie) || cie < 1 || cie > 31) return setErr('Día de cierre inválido (1-31)')
    if (isNaN(pag) || pag < 1 || pag > 31) return setErr('Día de pago inválido (1-31)')
    const errFecha = validarFechas(cie, pag)
    if (errFecha) return setErr(errFecha)

    const campos = {
      nombre:         nombre.trim(),
      banco:          banco.trim() || undefined,
      ultimos_4:      ult4.replace(/\D/g, '').slice(0, 4) || undefined,
      limite_credito: toCentavos(lim),
      dia_cierre:     cie,
      dia_pago:       pag,
      color,
    }
    try {
      setGuardando(true)
      if (tc) await actualizarTC(tc.id, campos)
      else    await agregarTC(campos)
      onCerrar()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const archivar = async () => {
    if (!tc) return
    try {
      await archivarTC(tc.id)
      onCerrar()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error al archivar')
    }
  }

  return (
    <div className="fixed inset-0 scrim flex items-end z-50">
      <div className="vidrio-hoja w-full rounded-t-hoja p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] max-h-[92dvh] overflow-y-auto overscroll-contain">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-text font-semibold tracking-titulo">
            {editando ? 'Editar tarjeta' : 'Nueva tarjeta'}
          </h2>
          <button onClick={onCerrar} className="presionable text-textDim hover:text-text text-lg">✕</button>
        </div>

        <div className="flex flex-col gap-3">
          <input
            placeholder="Nombre (ej: Visa BAC Personal)"
            value={nombre} onChange={e => setNombre(e.target.value)}
            className={CLASE_INPUT}
          />
          <input
            placeholder="Banco (opcional)"
            value={banco} onChange={e => setBanco(e.target.value)}
            className={CLASE_INPUT}
          />
          <input
            placeholder="Últimos 4 dígitos (opcional)"
            value={ult4} onChange={e => setUlt4(e.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric" maxLength={4}
            className={CLASE_INPUT}
          />
          <input
            placeholder="Límite de crédito (Q)"
            value={limite} onChange={e => setLimite(e.target.value)}
            inputMode="decimal"
            className={CLASE_INPUT}
          />
          <div className="flex gap-2">
            <input
              placeholder="Día de cierre"
              value={cierre} onChange={e => setCierre(e.target.value)}
              inputMode="numeric"
              className={`flex-1 ${CLASE_INPUT}`}
            />
            <input
              placeholder="Día de pago"
              value={pago} onChange={e => setPago(e.target.value)}
              inputMode="numeric"
              className={`flex-1 ${CLASE_INPUT}`}
            />
          </div>

          <div>
            <p className="text-textDim text-xs mb-2 tracking-micro">Color de la tarjeta</p>
            <div className="flex gap-2 flex-wrap">
              {COLORES_TC.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                  className={`presionable w-8 h-8 rounded-full border-2 ${color === c ? 'border-text scale-110' : 'border-transparent'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          {err && <p className="text-danger text-sm">{err}</p>}
          <button
            onClick={guardar}
            disabled={guardando}
            className="presionable w-full py-3 rounded-control bg-accent text-bg font-semibold text-sm disabled:opacity-50 mt-2"
          >
            {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Agregar tarjeta'}
          </button>
          {editando && (
            <button
              onClick={archivar}
              disabled={guardando}
              className="presionable w-full py-2 rounded-control bg-transparent text-danger/70 text-xs hover:text-danger"
            >
              Archivar tarjeta
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
