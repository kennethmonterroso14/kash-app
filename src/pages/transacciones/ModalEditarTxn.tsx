import { useId, useState } from 'react'
import Hoja from '../../components/Hoja'
import { toCentavos } from '../../lib/finanzas'
import { CLASE_INPUT } from '../../lib/clasesUI'
import { useSesion } from '../../context/sesion'
import type { Transaccion } from '../../hooks/useTransacciones'

interface Props {
  txn: Transaccion
  actualizar: (id: string, campos: {
    cantidad: number; descripcion: string; categoria: string; fecha: string
  }) => Promise<{ error: unknown }>
  onCerrar: () => void
}

export default function ModalEditarTxn({ txn, actualizar, onCerrar }: Props) {
  const { categoriasGasto, categoriasIngreso } = useSesion()
  // Ver la nota de htmlFor en ModalNuevoMovimiento.
  const id = useId()

  const [cantidad, setCantidad] = useState(String(Math.abs(txn.cantidad) / 100))
  const [descripcion, setDescripcion] = useState(txn.descripcion)
  const [categoria, setCategoria] = useState(txn.categoria)
  const [fecha, setFecha] = useState(txn.fecha)
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')

  const opciones =
    txn.tipo === 'ingreso' ? categoriasIngreso
    : txn.tipo === 'ajuste' ? ['Ajuste de cuenta', 'Transferencia']
    : categoriasGasto

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseFloat(cantidad)
    if (isNaN(val) || val <= 0) { setErr('Ingresa un monto mayor a Q0'); return }
    setGuardando(true)
    setErr('')
    // Se preserva el SIGNO guardado. Derivarlo del tipo volteaba el signo de
    // todo lo que no fuera 'gasto' (ajustes, patas de transferencia) y el
    // trigger de saldo terminaba aplicando 2x el monto. Un 'ajuste' es
    // legítimamente de cualquier signo.
    const cantidadFinal = txn.cantidad < 0 ? -toCentavos(val) : toCentavos(val)
    const { error } = await actualizar(txn.id, { cantidad: cantidadFinal, descripcion, categoria, fecha })
    setGuardando(false)
    if (error) {
      setErr(typeof error === 'string' ? error : (error as Error).message)
      return
    }
    onCerrar()
  }

  return (
    <Hoja titulo="Editar movimiento" onCerrar={onCerrar}>
      <form onSubmit={enviar} className="space-y-3">
        <div>
          <label htmlFor={`${id}-monto`} className="text-textDim text-xs mb-1 block tracking-micro">Monto (Q) — {txn.tipo}</label>
          <input id={`${id}-monto`}
            type="number" step="0.01" min="0.01" required placeholder="0.00"
            value={cantidad} onChange={e => setCantidad(e.target.value)}
            className={`w-full text-xl font-mono ${CLASE_INPUT}`}
          />
        </div>
        <div>
          <label htmlFor={`${id}-desc`} className="text-textDim text-xs mb-1 block tracking-micro">Descripción</label>
          <input id={`${id}-desc`}
            type="text" required placeholder="¿En qué?"
            value={descripcion} onChange={e => setDescripcion(e.target.value)}
            className={`w-full ${CLASE_INPUT}`}
          />
        </div>
        <div>
          <label htmlFor={`${id}-cat`} className="text-textDim text-xs mb-1 block tracking-micro">Categoría</label>
          <select id={`${id}-cat`}
            value={categoria} onChange={e => setCategoria(e.target.value)}
            className={`w-full ${CLASE_INPUT}`}
          >
            {opciones.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-fecha`} className="text-textDim text-xs mb-1 block tracking-micro">Fecha</label>
          <input id={`${id}-fecha`}
            type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className={`w-full ${CLASE_INPUT}`}
          />
        </div>

        {err && <p role="alert" className="text-danger text-sm bg-danger/10 rounded-control px-4 py-2">{err}</p>}

        <button
          type="submit" disabled={guardando}
          className="presionable w-full font-semibold py-3 rounded-control bg-accent text-bg disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </Hoja>
  )
}
