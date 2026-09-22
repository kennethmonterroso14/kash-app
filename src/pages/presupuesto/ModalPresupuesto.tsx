import { useState } from 'react'
import Aviso from '../../components/Aviso'
import Campo from '../../components/Campo'
import Hoja from '../../components/Hoja'
import { toCentavos } from '../../lib/finanzas'
import type { Presupuesto } from '../../hooks/usePresupuestos'

interface Props {
  /** En edición viene el presupuesto; al crear, la lista de categorías libres. */
  presupuesto?: Presupuesto
  categoriasDisponibles?: string[]
  /** Devuelve el mensaje de error, o null si salió bien. */
  guardar: (categoria: string, centavos: number) => Promise<string | null>
  onCerrar: () => void
}

/**
 * Alta y edición de un límite. Un componente para los dos casos: el formulario
 * era el mismo salvo el selector de categoría, que solo aparece al crear —
 * cambiar la categoría de un presupuesto existente es crear otro.
 */
export default function ModalPresupuesto({
  presupuesto, categoriasDisponibles = [], guardar, onCerrar,
}: Props) {
  const editando = !!presupuesto

  const [categoria, setCategoria] = useState(presupuesto?.categoria ?? categoriasDisponibles[0] ?? '')
  const [monto, setMonto] = useState(presupuesto ? String(presupuesto.monto_limite / 100) : '')
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseFloat(monto)
    if (isNaN(val) || val <= 0) return setErr('El monto debe ser mayor a 0')
    if (!categoria)             return setErr('Selecciona una categoría')
    setGuardando(true)
    setErr('')
    const msg = await guardar(categoria, toCentavos(val))
    setGuardando(false)
    if (msg) { setErr(msg); return }
    onCerrar()
  }

  return (
    <Hoja titulo={editando ? `Editar límite — ${presupuesto.categoria}` : 'Nuevo presupuesto'} onCerrar={onCerrar}>
      <form onSubmit={enviar} className="space-y-3">
        {!editando && (
          <Campo
            etiqueta="Categoría" tipo="select" required
            value={categoria} onChange={e => setCategoria(e.target.value)}
          >
            {categoriasDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
          </Campo>
        )}

        <Campo
          etiqueta="Monto límite (Q)" tipo="number" step="0.01" min="0.01" required placeholder="0.00"
          value={monto} onChange={e => setMonto(e.target.value)}
          clase="text-xl tabular-nums"
        />

        {err && <Aviso>{err}</Aviso>}

        <button
          type="submit" disabled={guardando}
          className="presionable w-full bg-accent text-bg font-semibold py-3 rounded-control disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Guardar presupuesto'}
        </button>
      </form>
    </Hoja>
  )
}
