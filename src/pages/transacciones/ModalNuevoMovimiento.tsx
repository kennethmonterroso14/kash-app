import { useId, useState } from 'react'
import Hoja from '../../components/Hoja'
import { toCentavos } from '../../lib/finanzas'
import { CLASE_INPUT } from '../../lib/clasesUI'
import { useSesion } from '../../context/sesion'
import { useMoneda } from '../../hooks/useMoneda'
import { useFechas } from '../../hooks/useFechas'
import type { useTransacciones } from '../../hooks/useTransacciones'

type Tipo = 'gasto' | 'ingreso' | 'gasto_tc' | 'transferencia'

const ETIQUETAS: Record<Tipo, string> = {
  gasto: 'Gasto', ingreso: 'Ingreso', gasto_tc: 'Cargo TC', transferencia: 'Transferencia',
}

// Clases literales por tipo: `bg-${tipo}` no lo ve el JIT de Tailwind.
const CLASE_TAB: Record<Tipo, string> = {
  ingreso:       'bg-accent text-bg',
  gasto:         'bg-danger text-text',
  gasto_tc:      'bg-warning/20 text-warning',
  transferencia: 'bg-accentAlt text-bg',
}
const CLASE_SUBMIT: Record<Tipo, string> = {
  ingreso:       'bg-accent text-bg',
  gasto:         'bg-danger text-text',
  gasto_tc:      'bg-warning/20 text-warning border border-warning/40',
  transferencia: 'bg-accentAlt text-bg',
}

interface Props {
  agregar: ReturnType<typeof useTransacciones>['addTxn']
  agregarTransferencia: ReturnType<typeof useTransacciones>['addTransferencia']
  onCerrar: () => void
}

/**
 * Alta de movimientos. Cuatro tipos, tres caminos de escritura distintos:
 * `gasto`/`ingreso` insertan una fila, `transferencia` inserta DOS en una
 * llamada, y `gasto_tc` va por `registrarCargo` del contexto porque pega en la
 * deuda de la tarjeta y no en una cuenta.
 */
export default function ModalNuevoMovimiento({ agregar, agregarTransferencia, onCerrar }: Props) {
  const { cuentas, categoriasGasto, categoriasIngreso, resumenTCs, registrarCargo } = useSesion()
  // Un <label> sin `htmlFor` no lo anuncia el lector de pantalla y tocarlo no
  // enfoca el campo. useId() da prefijos únicos por instancia del modal.
  const id = useId()
  const fmt = useMoneda()
  const fechas = useFechas()

  const [tipo, setTipo] = useState<Tipo>('gasto')
  const [cantidad, setCantidad] = useState('')
  const [descripcion, setDescripcion] = useState('')
  // Del contexto y no de las constantes: importar CATEGORIAS_GASTO directo se
  // come las categorías propias del usuario.
  const [categoria, setCategoria] = useState(categoriasGasto[0])
  const [fecha, setFecha] = useState(fechas.hoy())
  const [cuentaId, setCuentaId] = useState(cuentas[0]?.id ?? '')
  const [tcId, setTcId] = useState(resumenTCs[0]?.tc.id ?? '')
  const [transferDe, setTransferDe] = useState('')
  const [transferA, setTransferA] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')

  const categorias = tipo === 'ingreso' ? categoriasIngreso : categoriasGasto

  const cambiarTipo = (t: Tipo) => {
    setTipo(t)
    setCategoria(t === 'ingreso' ? categoriasIngreso[0] : categoriasGasto[0])
    if (t === 'transferencia') { setTransferDe(''); setTransferA('') }
  }

  // Aviso del disponible que quedaría en la TC. Sobre el monto ya validado:
  // pasarle un parseFloat crudo a toCentavos lo haría lanzar en pleno render.
  const montoNum = parseFloat(cantidad)
  const tcSel = resumenTCs.find(r => r.tc.id === tcId)
  const trasCargo = tipo === 'gasto_tc' && tcSel && !isNaN(montoNum) && montoNum > 0
    ? tcSel.tc.limite_credito - tcSel.tc.deuda_actual - toCentavos(montoNum)
    : null

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    const val = parseFloat(cantidad)
    if (isNaN(val) || val <= 0) return setErr('Ingresa un monto mayor a Q0')

    setGuardando(true)
    try {
      if (tipo === 'transferencia') {
        if (!transferDe || !transferA)   return setErr('Selecciona ambas cuentas')
        if (transferDe === transferA)    return setErr('Las cuentas deben ser distintas')
        const { error } = await agregarTransferencia({
          deCuentaId: transferDe,
          aCuentaId: transferA,
          cantidad: toCentavos(val),
          descripcion: descripcion || 'Transferencia',
          fecha,
        })
        if (error) return setErr(typeof error === 'string' ? error : error.message)
      } else if (tipo === 'gasto_tc') {
        if (!tcId) return setErr('Selecciona una tarjeta')
        await registrarCargo({
          tarjeta_id:  tcId,
          monto:       toCentavos(val),
          descripcion: descripcion.trim() || categoria,
          categoria,
          fecha,
        })
      } else {
        if (!descripcion.trim()) return setErr('Agrega una descripción')
        if (!cuentaId)           return setErr('Selecciona una cuenta')
        // El signo lo aplica el llamador: la constraint de la base exige
        // negativo para un gasto y positivo para un ingreso.
        const centavos = toCentavos(val)
        const { error } = await agregar({
          cuenta_id: cuentaId,
          cantidad: tipo === 'gasto' ? -centavos : centavos,
          descripcion, categoria, tipo, fecha,
        })
        if (error) return setErr(typeof error === 'string' ? error : error.message)
      }
      onCerrar()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  const campoFecha = (
    <div>
      <label htmlFor={`${id}-fecha`} className="text-textDim text-xs mb-1 block tracking-micro">Fecha</label>
      <input id={`${id}-fecha`} type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={`w-full ${CLASE_INPUT}`} />
    </div>
  )

  return (
    <Hoja titulo="Nuevo movimiento" onCerrar={onCerrar}>
      <div className="flex gap-1 bg-bg rounded-control p-1">
        {(Object.keys(ETIQUETAS) as Tipo[]).map(t => (
          <button
            key={t}
            onClick={() => cambiarTipo(t)}
            // 11px y px-1: con text-xs, "Transferencia" se salía del riel de
            // pestañas a 390px.
            className={`presionable flex-1 min-w-0 px-1 py-2 rounded-chip text-[11px] font-medium ${
              tipo === t ? CLASE_TAB[t] : 'text-textDim'
            }`}
          >
            {ETIQUETAS[t]}
          </button>
        ))}
      </div>

      <form onSubmit={enviar} className="space-y-3">
        <div>
          <label htmlFor={`${id}-monto`} className="text-textDim text-xs mb-1 block tracking-micro">Monto (Q)</label>
          <input id={`${id}-monto`}
            type="number" step="0.01" min="0.01" required placeholder="0.00"
            value={cantidad} onChange={e => setCantidad(e.target.value)}
            className={`w-full text-xl font-mono ${CLASE_INPUT}`}
          />
        </div>

        {tipo === 'transferencia' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${id}-de`} className="text-textDim text-xs mb-1 block tracking-micro">De cuenta</label>
                <select id={`${id}-de`} value={transferDe} onChange={e => setTransferDe(e.target.value)} required className={`w-full ${CLASE_INPUT}`}>
                  <option value="">Seleccionar</option>
                  {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-a`} className="text-textDim text-xs mb-1 block tracking-micro">A cuenta</label>
                <select id={`${id}-a`} value={transferA} onChange={e => setTransferA(e.target.value)} required className={`w-full ${CLASE_INPUT}`}>
                  <option value="">Seleccionar</option>
                  {cuentas.filter(c => c.id !== transferDe).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor={`${id}-desc-transfer`} className="text-textDim text-xs mb-1 block tracking-micro">Descripción (opcional)</label>
              <input id={`${id}-desc-transfer`}
                type="text" placeholder="ej. Ahorro mensual"
                value={descripcion} onChange={e => setDescripcion(e.target.value)}
                className={`w-full ${CLASE_INPUT}`}
              />
            </div>
            {campoFecha}
          </>
        ) : (
          <>
            <div>
              <label htmlFor={`${id}-desc`} className="text-textDim text-xs mb-1 block tracking-micro">Descripción</label>
              <input id={`${id}-desc`}
                type="text" required placeholder="¿En qué?"
                value={descripcion} onChange={e => setDescripcion(e.target.value)}
                className={`w-full ${CLASE_INPUT}`}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${id}-cat`} className="text-textDim text-xs mb-1 block tracking-micro">Categoría</label>
                <select id={`${id}-cat`} value={categoria} onChange={e => setCategoria(e.target.value)} className={`w-full ${CLASE_INPUT}`}>
                  {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-origen`} className="text-textDim text-xs mb-1 block tracking-micro">
                  {tipo === 'gasto_tc' ? 'Tarjeta' : 'Cuenta'}
                </label>
                {tipo === 'gasto_tc' ? (
                  <select id={`${id}-origen`} value={tcId} onChange={e => setTcId(e.target.value)} className={`w-full ${CLASE_INPUT}`}>
                    {resumenTCs.length === 0
                      ? <option value="">Sin tarjetas</option>
                      : resumenTCs.map(({ tc, resumen }) => (
                        <option key={tc.id} value={tc.id}>{tc.nombre} — {fmt(resumen.disponible)}</option>
                      ))}
                  </select>
                ) : (
                  <select id={`${id}-origen`} value={cuentaId} onChange={e => setCuentaId(e.target.value)} className={`w-full ${CLASE_INPUT}`}>
                    {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                )}
              </div>
            </div>
            {trasCargo !== null && (
              <p className={`text-xs font-mono ${trasCargo >= 0 ? 'text-success' : 'text-danger'}`}>
                Disponible tras cargo: {fmt(Math.max(0, trasCargo))}
                {trasCargo < 0 ? ' ⚠ excede disponible' : ''}
              </p>
            )}
            {campoFecha}
          </>
        )}

        {err && <p role="alert" className="text-danger text-sm bg-danger/10 rounded-control px-4 py-2">{err}</p>}

        <button
          type="submit"
          disabled={guardando || (tipo === 'transferencia' && transferDe === transferA)}
          className={`presionable w-full font-semibold py-3 rounded-control disabled:opacity-50 ${CLASE_SUBMIT[tipo]}`}
        >
          {guardando ? 'Guardando...'
            : tipo === 'transferencia' ? 'Transferir'
            : tipo === 'gasto_tc' ? 'Registrar cargo'
            : 'Guardar'}
        </button>
      </form>
    </Hoja>
  )
}
