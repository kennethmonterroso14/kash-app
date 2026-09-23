import { useState } from 'react'
import Aviso from '../../components/Aviso'
import Campo from '../../components/Campo'
import Hoja from '../../components/Hoja'
import { toCentavos, type TarjetaCredito } from '../../lib/finanzas'
import { useSesion } from '../../context/sesion'
import { useMoneda } from '../../hooks/useMoneda'
import { useFechas } from '../../hooks/useFechas'

interface Props {
  tc: TarjetaCredito
  onCerrar: () => void
}

/**
 * Un pago (`pago_tc`): debita la cuenta Y baja la deuda vía el trigger, que
 * reparte el monto entre el ciclo anterior y el actual y persiste ese reparto.
 */
export default function ModalPago({ tc, onCerrar }: Props) {
  const { cuentas, registrarPago } = useSesion()
  const fmt = useMoneda()
  const fechas = useFechas()

  // Se propone la deuda vencida, que es lo que hay que pagar para no generar
  // intereses. Antes esto lo hacía un helper de reset antes de abrir el modal.
  const [monto,  setMonto]  = useState((tc.deuda_ciclo_anterior / 100).toFixed(2))
  const [cuenta, setCuenta] = useState(cuentas[0]?.id ?? '')
  const [fecha,  setFecha]  = useState(fechas.hoy())
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const registrar = async () => {
    setErr(null)
    const num = parseFloat(monto)
    if (isNaN(num) || num <= 0) return setErr('El monto debe ser mayor a Q0')
    if (!cuenta)                return setErr('Selecciona una cuenta')
    try {
      setGuardando(true)
      await registrarPago({ tarjeta_id: tc.id, monto: toCentavos(num), cuenta_id: cuenta, fecha })
      onCerrar()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error al registrar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Hoja titulo={`Pagar — ${tc.nombre}`} onCerrar={onCerrar}>
      <div className="bg-vidrio-relleno rounded-control p-3 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-textDim">Deuda vencida (pagar ya)</span>
          <span className={`tabular-nums ${tc.deuda_ciclo_anterior > 0 ? 'text-danger' : 'text-textDim'}`}>
            {fmt(tc.deuda_ciclo_anterior)}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-textDim">Deuda ciclo actual</span>
          <span className="text-text tabular-nums">{fmt(tc.deuda_actual)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Campo
          etiqueta="Monto a pagar (Q)" placeholder="0.00" inputMode="decimal"
          value={monto} onChange={e => setMonto(e.target.value)}
          clase="tabular-nums"
        />
        <Campo
          etiqueta="Cuenta de cargo" tipo="select"
          value={cuenta} onChange={e => setCuenta(e.target.value)}
        >
          {cuentas.map(c => (
            <option key={c.id} value={c.id}>{c.nombre} — {fmt(c.saldo)}</option>
          ))}
        </Campo>
        <Campo
          etiqueta="Fecha" tipo="date"
          value={fecha} onChange={e => setFecha(e.target.value)}
        />
        {err && <Aviso>{err}</Aviso>}
        <button
          onClick={registrar}
          disabled={guardando}
          className="presionable w-full h-12 rounded-full bg-accent text-bg font-semibold text-sm disabled:opacity-50"
        >
          {guardando ? 'Registrando...' : 'Registrar pago'}
        </button>
      </div>
    </Hoja>
  )
}
