import { useState } from 'react'
import Aviso from '../../components/Aviso'
import Campo from '../../components/Campo'
import Hoja from '../../components/Hoja'
import { crearCuentaConSaldo } from '../../lib/altaCuenta'
import { toCentavos } from '../../lib/finanzas'
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

    // El alta vive en `lib/altaCuenta.ts`: la comparte con `SetupPage`, que
    // crea la primera cuenta antes de que exista el provider. La compensación
    // por si falla el ajuste está documentada ahí.
    const fallo = await crearCuentaConSaldo({
      userId, nombre, tipo, color, saldoCentavos, hoy: fechas.hoy(),
    })
    if (fallo) { setErr(fallo); setGuardando(false); return }

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
            clase="tabular-nums"
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

        {err && <Aviso>{err}</Aviso>}

        <button
          type="submit" disabled={guardando}
          className="presionable w-full bg-accent text-bg font-semibold h-12 rounded-full disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : 'Crear cuenta'}
        </button>
      </form>
    </Hoja>
  )
}
