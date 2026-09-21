import { useId, useState } from 'react'
import Hoja from '../../components/Hoja'
import { toCentavos } from '../../lib/finanzas'
import { CLASE_INPUT } from '../../lib/clasesUI'

interface Props {
  /** Devuelve el mensaje de error, o null si salió bien. */
  guardar: (nombre: string, objetivoCentavos: number, actualCentavos: number) => Promise<string | null>
  onCerrar: () => void
}

export default function ModalMeta({ guardar, onCerrar }: Props) {
  const id = useId()
  const [nombre, setNombre] = useState('')
  const [objetivo, setObjetivo] = useState('')
  const [actual, setActual] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    const obj = parseFloat(objetivo)
    const act = parseFloat(actual || '0')

    // Se valida ANTES de convertir: toCentavos lanza con NaN o negativos, e
    // Infinity pasaría en silencio hasta el insert.
    if (!nombre.trim())                          return setErr('El nombre es requerido.')
    if (!Number.isFinite(obj) || obj <= 0)       return setErr('El monto objetivo debe ser mayor a 0.')
    if (!Number.isFinite(act) || act < 0)        return setErr('El monto "Ya tengo" no puede ser negativo.')

    const objCent = toCentavos(obj)
    const actCent = toCentavos(act)
    if (actCent > objCent) return setErr('El monto "Ya tengo" no puede superar el objetivo')

    setGuardando(true)
    const msg = await guardar(nombre.trim(), objCent, actCent)
    setGuardando(false)
    if (msg) { setErr(msg); return }
    onCerrar()
  }

  return (
    <Hoja titulo="Nueva meta" onCerrar={onCerrar}>
      <form onSubmit={enviar} className="space-y-3">
        <div>
          <label htmlFor={`${id}-nombre`} className="text-textDim text-xs mb-1 block tracking-micro">Nombre</label>
          <input
            id={`${id}-nombre`} type="text" required placeholder="ej. Fondo de emergencia"
            value={nombre} onChange={e => setNombre(e.target.value)}
            className={`w-full ${CLASE_INPUT}`}
          />
        </div>
        <div>
          <label htmlFor={`${id}-objetivo`} className="text-textDim text-xs mb-1 block tracking-micro">Monto objetivo (Q)</label>
          <input
            id={`${id}-objetivo`} type="number" step="0.01" min="0.01" required placeholder="0.00"
            value={objetivo} onChange={e => setObjetivo(e.target.value)}
            className={`w-full text-xl font-mono ${CLASE_INPUT}`}
          />
        </div>
        <div>
          <label htmlFor={`${id}-actual`} className="text-textDim text-xs mb-1 block tracking-micro">Ya tengo (Q, opcional)</label>
          <input
            id={`${id}-actual`} type="number" step="0.01" min="0" placeholder="0.00"
            value={actual} onChange={e => setActual(e.target.value)}
            className={`w-full font-mono ${CLASE_INPUT}`}
          />
        </div>

        {err && <p role="alert" className="text-danger text-sm">{err}</p>}

        <button
          type="submit" disabled={guardando}
          className="presionable w-full bg-accent text-bg font-semibold py-3 rounded-control disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : 'Crear meta'}
        </button>
      </form>
    </Hoja>
  )
}
