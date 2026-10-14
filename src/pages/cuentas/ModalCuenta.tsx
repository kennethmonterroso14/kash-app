import { useState } from 'react'
import Aviso from '../../components/Aviso'
import BotonConfirmar from '../../components/BotonConfirmar'
import Campo from '../../components/Campo'
import Hoja from '../../components/Hoja'
import { crearCuentaConSaldo } from '../../lib/altaCuenta'
import { simboloMoneda, toCentavos, type MonedaCuenta } from '../../lib/finanzas'
import { useSesion } from '../../context/sesion'
import { useFechas } from '../../hooks/useFechas'
import { useMoneda } from '../../hooks/useMoneda'
import type { Cuenta } from '../../hooks/useCuentas'
import { paletaDatos } from '../../lib/tokens'

const TIPOS = ['ahorro', 'corriente', 'efectivo', 'inversion', 'otro'] as const

interface Props {
  /** Sin cuenta es un alta; con cuenta, su edición. Un solo formulario para las dos. */
  cuenta?: Cuenta
  onCerrar: () => void
}

/**
 * Alta y edición de una cuenta.
 *
 * En la edición el saldo NO es un campo: lo mueve el trigger a partir de las
 * transacciones, y escribirlo a mano lo dejaría peleando con los deltas. Para
 * corregirlo está "Cambiar saldo", que inserta un `ajuste` por la diferencia. Eliminar vive acá abajo,
 * con dos toques, y la regla de qué pasa (borrar, archivar o negarse) es de
 * `decidirBajaCuenta`.
 *
 * La moneda se elige al crearla y se puede cambiar después. Cambiarla
 * RE-ETIQUETA la cuenta, no la convierte: es el caso de "registré mi cuenta de
 * dólares como quetzales", donde los números ya eran dólares. La hoja lo dice
 * antes de guardar, con el antes y el después.
 */
const MONEDAS: { id: MonedaCuenta; etiqueta: string }[] = [
  { id: 'GTQ', etiqueta: 'Quetzales' },
  { id: 'USD', etiqueta: 'Dólares' },
]

export default function ModalCuenta({ cuenta, onCerrar }: Props) {
  const { userId, refrescar, actualizarCuenta, eliminarCuenta, monedaCuentasDisponible, perfil } = useSesion()
  const fechas = useFechas()
  const fmt = useMoneda()
  const editando = !!cuenta

  const [nombre, setNombre] = useState(cuenta?.nombre ?? '')
  const [tipo, setTipo] = useState<string>(cuenta?.tipo ?? 'ahorro')
  const [saldo, setSaldo] = useState('')
  const [color, setColor] = useState(cuenta?.color ?? paletaDatos[0])
  const [moneda, setMoneda] = useState<MonedaCuenta>(cuenta?.moneda ?? 'GTQ')
  const cambiaMoneda = !!cuenta && moneda !== cuenta.moneda
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return setErr('El nombre es requerido')

    if (cuenta) {
      setGuardando(true)
      setErr('')
      const fallo = await actualizarCuenta(cuenta.id, { nombre, tipo, color, moneda })
      setGuardando(false)
      if (fallo) return setErr(fallo)
      onCerrar()
      return
    }

    // Dejar el saldo en blanco significa Q0.00, no "no hacer nada".
    const saldoQ = saldo.trim() === '' ? 0 : parseFloat(saldo)
    if (!Number.isFinite(saldoQ) || saldoQ < 0) return setErr('Ingresa un saldo válido (0 o mayor)')

    setGuardando(true)
    setErr('')
    // El alta vive en `lib/altaCuenta.ts`: la comparte con `SetupPage`, que
    // crea la primera cuenta antes de que exista el provider. La compensación
    // por si falla el ajuste está documentada ahí.
    const fallo = await crearCuentaConSaldo({
      userId, nombre, tipo, color, saldoCentavos: toCentavos(saldoQ), hoy: fechas.hoy(),
      ...(monedaCuentasDisponible && { moneda }),
    })
    if (fallo) { setErr(fallo); setGuardando(false); return }

    setGuardando(false)
    onCerrar()
    // Se invalida solo el slice que el trigger de saldo tocó.
    await refrescar.cuentas()
  }

  const eliminar = async () => {
    if (!cuenta) return
    setGuardando(true)
    setErr('')
    const r = await eliminarCuenta(cuenta.id)
    setGuardando(false)
    if ('ok' in r) { onCerrar(); return }
    if ('error' in r) { setErr(r.error); return }
    setErr(r.bloqueada === 'saldo'
      ? `Esta cuenta tiene ${fmt(cuenta.saldo, cuenta.moneda)}. Para eliminarla, primero pasa ese saldo a otra cuenta con una transferencia, o déjala en ${fmt(0, cuenta.moneda)} con "Cambiar saldo".`
      : 'Esta cuenta tiene pagos fijos activos. Cámbialos a otra cuenta o elimínalos en Ajustes → Pagos fijos, y vuelve a intentarlo.')
  }

  return (
    <Hoja titulo={editando ? 'Editar cuenta' : 'Nueva cuenta'} onCerrar={onCerrar}>
      <form onSubmit={enviar} className="space-y-3">
        <Campo
          etiqueta="Nombre" required placeholder="ej. BI Ahorros"
          value={nombre} onChange={e => setNombre(e.target.value)}
        />

        <div className={editando ? '' : 'grid grid-cols-2 gap-3'}>
          <Campo etiqueta="Tipo" tipo="select" value={tipo} onChange={e => setTipo(e.target.value)}>
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </Campo>
          {!editando && (
            <Campo
              etiqueta={`Saldo inicial (${simboloMoneda({ moneda, locale: perfil.locale })})`} tipo="number" step="0.01" min="0" placeholder="0.00"
              value={saldo} onChange={e => setSaldo(e.target.value)}
              clase="tabular-nums"
            />
          )}
        </div>

        {/* Sin la columna en la base no se ofrece: todo es quetzales. */}
        {monedaCuentasDisponible && (
          <div>
            <p className="text-textDim text-xs mb-2 tracking-micro">Moneda</p>
            <div role="radiogroup" aria-label="Moneda de la cuenta" className="flex gap-1 bg-vidrio-relleno rounded-full p-1">
              {MONEDAS.map(m => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={moneda === m.id}
                  onClick={() => setMoneda(m.id)}
                  className={`flex-1 h-9 rounded-full text-[14px] transition-colors duration-rapida ${
                    moneda === m.id ? 'bg-vidrio-segmento shadow-chip text-text font-semibold' : 'text-textDim font-medium'
                  }`}
                >
                  {m.etiqueta}
                </button>
              ))}
            </div>
          </div>
        )}

        {cambiaMoneda && (
          <Aviso tono="atencion">
            Los montos no se convierten: el saldo pasa de {fmt(cuenta.saldo, cuenta.moneda)} a{' '}
            {fmt(cuenta.saldo, moneda)}, y los movimientos de esta cuenta se leen en{' '}
            {moneda === 'USD' ? 'dólares' : 'quetzales'}. Si el saldo real es otro, corrígelo después con “Cambiar saldo”.
          </Aviso>
        )}

        {cuenta && !cambiaMoneda && (
          <p className="text-textDim text-[13px]">
            Saldo actual <span className="text-text tabular-nums font-semibold">{fmt(cuenta.saldo, cuenta.moneda)}</span>.
            Para corregirlo usa “Cambiar saldo” en la lista: escribes el saldo real y queda registrado como un ajuste.
          </p>
        )}

        <div>
          <p className="text-textDim text-xs mb-2 tracking-micro">Color</p>
          <div className="flex gap-2 flex-wrap">
            {paletaDatos.map(c => (
              <button
                key={c} type="button" onClick={() => setColor(c)}
                aria-label={`Color ${c}`} aria-pressed={color === c}
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
          {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear cuenta'}
        </button>

        {cuenta && (
          <BotonConfirmar
            variante="bloque"
            accion={`Eliminar la cuenta ${cuenta.nombre}`}
            etiqueta="Eliminar cuenta"
            etiquetaArmada="¿Eliminar? Toca otra vez para confirmar"
            disabled={guardando}
            onConfirmar={() => void eliminar()}
          />
        )}
      </form>
    </Hoja>
  )
}
