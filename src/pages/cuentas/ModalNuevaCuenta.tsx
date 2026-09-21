import { useState } from 'react'
import Campo from '../../components/Campo'
import Hoja from '../../components/Hoja'
import { toCentavos } from '../../lib/finanzas'
import { supabase } from '../../lib/supabase'
import { useSesion } from '../../context/sesion'
import { useFechas } from '../../hooks/useFechas'
import { paletaDatos } from '../../lib/tokens'

const TIPOS = ['ahorro', 'corriente', 'efectivo', 'inversion', 'otro'] as const

interface Props {
  onCerrar: () => void
}

export default function ModalNuevaCuenta({ onCerrar }: Props) {
  const { userId, refrescar } = useSesion()
  const fechas = useFechas()

  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]>('ahorro')
  const [saldo, setSaldo] = useState('')
  const [color, setColor] = useState(paletaDatos[0])
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    // Dejar el saldo en blanco significa Q0.00, no "no hacer nada".
    const saldoQ = saldo.trim() === '' ? 0 : parseFloat(saldo)
    if (!nombre.trim()) return setErr('El nombre es requerido')
    if (!Number.isFinite(saldoQ) || saldoQ < 0) return setErr('Ingresa un saldo válido (0 o mayor)')

    setGuardando(true)
    setErr('')
    const saldoCentavos = toCentavos(saldoQ)

    // La cuenta se crea en 0: el saldo lo pone el trigger a partir del ajuste.
    // Nunca se escribe `cuentas.saldo` desde el cliente.
    const { data: cuenta, error: errCuenta } = await supabase
      .from('cuentas')
      .insert({ user_id: userId, nombre: nombre.trim(), tipo, saldo: 0, color })
      .select('id, nombre')
      .single()
    if (errCuenta) { setErr(errCuenta.message); setGuardando(false); return }

    if (saldoCentavos > 0) {
      const { error: errTxn } = await supabase.from('transacciones').insert({
        user_id: userId,
        cuenta_id: cuenta.id,
        fecha: fechas.hoy(),
        cantidad: saldoCentavos,
        descripcion: `Saldo inicial ${cuenta.nombre}`.slice(0, 200),
        categoria: 'Ajuste de cuenta',
        tipo: 'ajuste',
      })
      if (errTxn) {
        // Se compensa: sin esto la cuenta queda huérfana en Q0.00 y un
        // reintento la duplica. Todavía no hay transacciones que la
        // referencien, así que el `on delete restrict` no se dispara.
        const { error: errRollback } = await supabase
          .from('cuentas').delete().eq('id', cuenta.id).eq('user_id', userId)
        setErr(errRollback
          ? `${errTxn.message} — la cuenta "${cuenta.nombre}" quedó creada con saldo Q0.00; ajusta su saldo manualmente.`
          : errTxn.message)
        setGuardando(false)
        return
      }
    }

    setGuardando(false)
    onCerrar()
    // Se invalida solo el slice que el trigger de saldo tocó. Antes esto era
    // un window.location.reload(), porque useCuentas no tenía refetch.
    await refrescar.cuentas()
  }

  return (
    <Hoja titulo="Nueva cuenta" onCerrar={onCerrar}>
      <form onSubmit={enviar} className="space-y-3">
        <Campo
          etiqueta="Nombre" required placeholder="ej. BI Ahorros"
          value={nombre} onChange={e => setNombre(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <Campo
            etiqueta="Tipo" tipo="select" value={tipo}
            onChange={e => setTipo(e.target.value as (typeof TIPOS)[number])}
          >
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </Campo>
          <Campo
            etiqueta="Saldo inicial (Q)" tipo="number" step="0.01" min="0" placeholder="0.00"
            value={saldo} onChange={e => setSaldo(e.target.value)}
            clase="font-mono"
          />
        </div>

        <div>
          <p className="text-textDim text-xs mb-2 tracking-micro">Color</p>
          <div className="flex gap-2 flex-wrap">
            {paletaDatos.map(c => (
              <button
                key={c} type="button" onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                className={`presionable w-8 h-8 rounded-full border-2 ${color === c ? 'border-text scale-110' : 'border-transparent'}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        {err && <p role="alert" className="text-danger text-xs">{err}</p>}

        <button
          type="submit" disabled={guardando}
          className="presionable w-full bg-accent text-bg font-semibold py-3 rounded-control disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : 'Crear cuenta'}
        </button>
      </form>
    </Hoja>
  )
}
