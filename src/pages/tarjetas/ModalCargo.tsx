import { useState } from 'react'
import Aviso from '../../components/Aviso'
import Campo from '../../components/Campo'
import Hoja from '../../components/Hoja'
import { IconoAlerta } from '../../components/iconos'
import { toCentavos, type TarjetaCredito } from '../../lib/finanzas'
import { useSesion } from '../../context/sesion'
import { useMoneda } from '../../hooks/useMoneda'
import { useFechas } from '../../hooks/useFechas'

interface Props {
  tc: TarjetaCredito
  onCerrar: () => void
}

/** Un cargo (`gasto_tc`): pega en la deuda de la tarjeta, no en una cuenta. */
export default function ModalCargo({ tc, onCerrar }: Props) {
  const { categoriasGasto, registrarCargo } = useSesion()
  const fmt = useMoneda()
  const fechas = useFechas()

  const [monto, setMonto] = useState('')
  const [cat,   setCat]   = useState(categoriasGasto[0])
  const [desc,  setDesc]  = useState('')
  const [fecha, setFecha] = useState(fechas.hoy())
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const montoNum = parseFloat(monto)
  const montoValido = !isNaN(montoNum) && montoNum > 0
  // El disponible que quedaría. Se calcula sobre el monto ya validado: pasarle
  // un parseFloat crudo a toCentavos lo haría lanzar en pleno render.
  const disponibleTras = montoValido
    ? tc.limite_credito - tc.deuda_actual - toCentavos(montoNum)
    : null

  const registrar = async () => {
    setErr(null)
    if (!montoValido)  return setErr('El monto debe ser mayor a Q0')
    if (!desc.trim())  return setErr('La descripción es requerida')
    const montoCent  = toCentavos(montoNum)
    const disponible = tc.limite_credito - tc.deuda_actual
    if (montoCent > disponible) return setErr(`Excede el disponible (${fmt(disponible)})`)
    try {
      setGuardando(true)
      await registrarCargo({
        tarjeta_id:  tc.id,
        monto:       montoCent,
        descripcion: desc.trim(),
        categoria:   cat,
        fecha,
      })
      onCerrar()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error al registrar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Hoja titulo={`Cargo — ${tc.nombre}`} onCerrar={onCerrar}>
      {disponibleTras !== null && (
        <div className="bg-bg rounded-control p-3">
          <p className="text-textDim text-xs mb-0.5 tracking-micro">Disponible tras este cargo</p>
          <p className={`font-mono font-bold text-lg ${disponibleTras >= 0 ? 'text-success' : 'text-danger'}`}>
            {fmt(Math.max(0, disponibleTras))}
          </p>
          {disponibleTras < 0 && (
            <p className="text-danger text-xs mt-1 flex items-center gap-1">
              <IconoAlerta size={13} className="shrink-0" /> Excede el disponible
            </p>
          )}
          {disponibleTras >= 0 &&
            (tc.deuda_actual + toCentavos(montoNum)) / tc.limite_credito >= 0.9 && (
            <p className="text-warning text-xs mt-1 flex items-center gap-1">
              <IconoAlerta size={13} className="shrink-0" /> Superarás el 90% de uso de la TC
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Campo
          etiqueta="Monto (Q)" placeholder="0.00" inputMode="decimal"
          value={monto} onChange={e => setMonto(e.target.value)}
          clase="font-mono"
        />
        <Campo
          etiqueta="Descripción" placeholder="¿En qué?"
          value={desc} onChange={e => setDesc(e.target.value)}
        />
        <div>
          <p className="text-textDim text-xs mb-2 tracking-micro">Categoría</p>
          <div className="flex flex-wrap gap-1.5">
            {categoriasGasto.map(c => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`presionable px-3 py-1.5 rounded-chip text-xs ${
                  cat === c ? 'bg-accent text-bg font-semibold' : 'bg-bg text-textDim hover:text-text'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <Campo
          etiqueta="Fecha" tipo="date"
          value={fecha} onChange={e => setFecha(e.target.value)}
        />
        {err && <Aviso>{err}</Aviso>}
        <button
          onClick={registrar}
          disabled={guardando}
          className="presionable w-full py-3 rounded-control bg-accent text-bg font-semibold text-sm disabled:opacity-50"
        >
          {guardando ? 'Registrando...' : 'Registrar cargo'}
        </button>
      </div>
    </Hoja>
  )
}
