import { useState } from 'react'
import Aviso from '../../components/Aviso'
import Campo from '../../components/Campo'
import Hoja from '../../components/Hoja'
import { toCentavos } from '../../lib/finanzas'
import { supabase } from '../../lib/supabase'
import { useSesion } from '../../context/sesion'
import { useFechas } from '../../hooks/useFechas'

interface Props {
  cuenta: { id: string; nombre: string }
  onCerrar: () => void
}

/**
 * Corrige el saldo insertando una transacción de tipo `ajuste`, que es la única
 * vía: `cuentas.saldo` lo mantiene el trigger y nunca se escribe desde acá.
 */
export default function ModalAjusteSaldo({ cuenta, onCerrar }: Props) {
  const { userId, refrescar } = useSesion()
  const fechas = useFechas()

  const [monto, setMonto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseFloat(monto)
    // La base rechaza cantidad = 0, así que se ataja antes de llegar.
    if (!Number.isFinite(val) || val === 0) return setErr('Ingresa un monto distinto de cero')
    setGuardando(true)
    setErr('')
    // El signo lo aplica el llamador: toCentavos lanza con negativos.
    const { error } = await supabase.from('transacciones').insert({
      user_id: userId,
      cuenta_id: cuenta.id,
      fecha: fechas.hoy(),
      cantidad: toCentavos(Math.abs(val)) * (val < 0 ? -1 : 1),
      descripcion: `Ajuste de saldo — ${cuenta.nombre}`,
      categoria: 'Ajuste de cuenta',
      tipo: 'ajuste',
    })
    if (error) { setErr(error.message); setGuardando(false); return }
    setGuardando(false)
    onCerrar()
    await refrescar.cuentas()
  }

  return (
    <Hoja titulo={`Ajustar — ${cuenta.nombre}`} onCerrar={onCerrar}>
      <p className="text-textDim text-sm">
        Ingresa un valor positivo para sumar o negativo para restar del saldo.
      </p>
      <form onSubmit={enviar} className="space-y-3">
        <Campo
          etiqueta="Monto (Q)" tipo="number" step="0.01" required placeholder="ej. -500.00 o 200.00"
          value={monto} onChange={e => setMonto(e.target.value)}
          clase="text-xl font-mono"
        />
        {err && <Aviso>{err}</Aviso>}
        <button
          type="submit" disabled={guardando}
          className="presionable w-full bg-accent text-bg font-semibold py-3 rounded-control disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : 'Aplicar ajuste'}
        </button>
      </form>
    </Hoja>
  )
}
