import { useState } from 'react'
import Aviso from '../../components/Aviso'
import Campo from '../../components/Campo'
import Hoja from '../../components/Hoja'
import { calcAjusteParaSaldo, centavosConSigno } from '../../lib/finanzas'
import { supabase } from '../../lib/supabase'
import { useSesion } from '../../context/sesion'
import { useFechas } from '../../hooks/useFechas'
import { useMoneda } from '../../hooks/useMoneda'

interface Props {
  cuenta: { id: string; nombre: string; saldo: number }
  onCerrar: () => void
}

/**
 * Pone el saldo de la cuenta en el valor que el usuario escribe — el que ve en
 * su banco —, en lugar de pedirle cuánto sumar o restar.
 *
 * Por debajo sigue siendo un `ajuste`: `cuentas.saldo` lo mantiene el trigger y
 * nunca se escribe desde acá, así que "sobrescribir" es insertar la diferencia
 * (`calcAjusteParaSaldo`). Así el cambio queda en el historial y el total del
 * patrimonio sigue cuadrando con los movimientos.
 *
 * La diferencia se calcula contra el saldo de la BASE en el momento de guardar,
 * no el de la pantalla: si otro dispositivo registró algo mientras tanto, el
 * resultado igual queda en el valor que se escribió.
 */
export default function ModalAjusteSaldo({ cuenta, onCerrar }: Props) {
  const { userId, refrescar, invalidarTxns } = useSesion()
  const fechas = useFechas()
  const fmt = useMoneda()

  const [monto, setMonto] = useState((cuenta.saldo / 100).toFixed(2))
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')

  const nuevo = centavosConSigno(monto)
  const diferencia = nuevo === null ? null : calcAjusteParaSaldo(cuenta.saldo, nuevo)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (nuevo === null) return setErr('Ingresa el saldo como un número, por ejemplo 1250.50')
    setGuardando(true)
    setErr('')

    const { data: fila, error: errLeer } = await supabase
      .from('cuentas').select('saldo').eq('id', cuenta.id).eq('user_id', userId).single()
    if (errLeer || !fila) {
      setErr('No se pudo leer el saldo actual. Revisa tu conexión e intenta de nuevo.')
      setGuardando(false)
      return
    }
    const delta = calcAjusteParaSaldo(fila.saldo, nuevo)
    // Ya está en ese valor: no hay nada que registrar (y la base rechaza 0).
    if (delta === 0) { setGuardando(false); onCerrar(); return }

    const { error } = await supabase.from('transacciones').insert({
      user_id: userId,
      cuenta_id: cuenta.id,
      fecha: fechas.hoy(),
      cantidad: delta,
      descripcion: `Saldo actualizado a ${fmt(nuevo)} — ${cuenta.nombre}`.slice(0, 200),
      categoria: 'Ajuste de cuenta',
      tipo: 'ajuste',
    })
    if (error) {
      setErr('No se pudo guardar el saldo. Revisa tu conexión e intenta de nuevo.')
      setGuardando(false)
      return
    }
    setGuardando(false)
    onCerrar()
    await refrescar.cuentas()
    invalidarTxns()
  }

  return (
    <Hoja titulo={`Saldo de ${cuenta.nombre}`} onCerrar={onCerrar}>
      <p className="text-textDim text-sm">
        Escribe el saldo que tiene hoy la cuenta, el que ves en tu banco. La app registra la
        diferencia como un ajuste para que tu historial siga cuadrando.
      </p>
      <form onSubmit={enviar} className="space-y-3">
        <Campo
          etiqueta="Saldo real (Q)" tipo="number" step="0.01" required inputMode="decimal"
          value={monto} onChange={e => setMonto(e.target.value)}
          clase="text-xl tabular-nums"
        />
        {diferencia !== null && diferencia !== 0 && (
          <p className="text-textDim text-[13px] tabular-nums">
            Hoy tiene {fmt(cuenta.saldo)}. Se registrará un ajuste de{' '}
            <span className={`whitespace-nowrap ${diferencia > 0 ? 'text-success' : 'text-danger'}`}>
              {diferencia > 0 ? '+' : ''}{fmt(diferencia)}
            </span>.
          </p>
        )}
        {err && <Aviso>{err}</Aviso>}
        <button
          type="submit" disabled={guardando || diferencia === 0}
          className="presionable w-full bg-accent text-bg font-semibold h-12 rounded-full disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : diferencia === 0 ? 'Sin cambios' : 'Guardar saldo'}
        </button>
      </form>
    </Hoja>
  )
}
