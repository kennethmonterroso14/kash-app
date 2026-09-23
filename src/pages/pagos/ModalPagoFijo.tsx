import { useState } from 'react'
import Aviso from '../../components/Aviso'
import Campo from '../../components/Campo'
import Hoja from '../../components/Hoja'
import { toCentavos } from '../../lib/finanzas'
import { useSesion } from '../../context/sesion'
import type { PagoRecurrente } from '../../hooks/usePagosRecurrentes'

/**
 * Solo hasta 28: un pago fijo el 30 no existiría en febrero, y el
 * auto-aplicador tendría que inventar una fecha.
 */
const DIAS = Array.from({ length: 28 }, (_, i) => i + 1)

export interface CamposPago {
  nombre: string
  monto: number
  dia_del_mes: number
  cuenta_id: string
  categoria: string
}

interface Props {
  /** En edición viene el pago; en alta no. */
  pago?: PagoRecurrente
  /** Devuelve el mensaje de error, o null si salió bien. */
  guardar: (campos: CamposPago) => Promise<string | null>
  onCerrar: () => void
}

export default function ModalPagoFijo({ pago, guardar, onCerrar }: Props) {
  const { cuentas, categoriasGasto } = useSesion()
  const editando = !!pago

  // 'Suscripciones' es el default razonable para un pago fijo, pero solo si el
  // usuario la tiene: estaba cableada, y quien la hubiera borrado quedaba con
  // un select sin opción coincidente.
  const categoriaInicial = pago?.categoria
    ?? (categoriasGasto.includes('Suscripciones') ? 'Suscripciones' : categoriasGasto[0] ?? '')

  const [nombre, setNombre]     = useState(pago?.nombre ?? '')
  const [monto, setMonto]       = useState(pago ? String(pago.monto / 100) : '')
  const [dia, setDia]           = useState(pago?.dia_del_mes ?? 1)
  const [cuenta, setCuenta]     = useState(pago?.cuenta_id ?? cuentas[0]?.id ?? '')
  const [categoria, setCategoria] = useState(categoriaInicial)
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseFloat(monto)
    if (isNaN(val) || val <= 0) return setErr('El monto debe ser mayor a 0')
    if (!nombre.trim())         return setErr('Ingresa un nombre')
    if (!cuenta)                return setErr('Selecciona una cuenta')
    setGuardando(true)
    setErr('')
    const msg = await guardar({
      nombre: nombre.trim(),
      monto: toCentavos(val),
      dia_del_mes: dia,
      cuenta_id: cuenta,
      categoria,
    })
    setGuardando(false)
    if (msg) { setErr(msg); return }
    onCerrar()
  }

  return (
    <Hoja titulo={editando ? 'Editar pago fijo' : 'Nuevo pago fijo'} onCerrar={onCerrar}>
      <form onSubmit={enviar} className="space-y-3">
        <Campo
          etiqueta="Nombre" required placeholder="ej. Netflix, renta, gym"
          value={nombre} onChange={e => setNombre(e.target.value)}
        />
        <Campo
          etiqueta="Monto (Q)" tipo="number" step="0.01" min="0.01" required placeholder="0.00"
          value={monto} onChange={e => setMonto(e.target.value)}
          clase="text-xl tabular-nums"
        />
        <div className="grid grid-cols-2 gap-3">
          <Campo
            etiqueta="Día del mes" tipo="select"
            value={dia} onChange={e => setDia(Number(e.target.value))}
          >
            {DIAS.map(d => <option key={d} value={d}>{d}</option>)}
          </Campo>
          <Campo
            etiqueta="Categoría" tipo="select"
            value={categoria} onChange={e => setCategoria(e.target.value)}
          >
            {categoriasGasto.map(c => <option key={c} value={c}>{c}</option>)}
          </Campo>
        </div>
        <Campo
          etiqueta="Cuenta de cargo" tipo="select"
          value={cuenta} onChange={e => setCuenta(e.target.value)}
        >
          {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </Campo>

        {err && <Aviso>{err}</Aviso>}

        <button
          type="submit" disabled={guardando}
          className="presionable w-full bg-accent text-bg font-semibold h-12 rounded-full disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear pago fijo'}
        </button>
      </form>
    </Hoja>
  )
}
