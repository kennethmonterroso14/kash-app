import { useState } from 'react'
import Aviso from '../../components/Aviso'
import Campo from '../../components/Campo'
import Hoja from '../../components/Hoja'
import { toCentavos } from '../../lib/finanzas'

interface Props {
  /** Devuelve el mensaje de error, o null si salió bien. */
  guardar: (nombre: string, objetivoCentavos: number, actualCentavos: number) => Promise<string | null>
  onCerrar: () => void
}

export default function ModalMeta({ guardar, onCerrar }: Props) {
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
        <Campo
          etiqueta="Nombre" required placeholder="ej. Fondo de emergencia"
          value={nombre} onChange={e => setNombre(e.target.value)}
        />
        <Campo
          etiqueta="Monto objetivo (Q)" tipo="number" step="0.01" min="0.01" required placeholder="0.00"
          value={objetivo} onChange={e => setObjetivo(e.target.value)}
          clase="text-xl tabular-nums"
        />
        <Campo
          etiqueta="Ya tengo (Q, opcional)" tipo="number" step="0.01" min="0" placeholder="0.00"
          value={actual} onChange={e => setActual(e.target.value)}
          clase="tabular-nums"
        />

        {err && <Aviso>{err}</Aviso>}

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
