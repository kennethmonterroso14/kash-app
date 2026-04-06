import { useState, useMemo } from 'react'
import { usePagosRecurrentes } from '../hooks/usePagosRecurrentes'
import { useCuentas } from '../hooks/useCuentas'
import { formatQ, toCentavos } from '../lib/finanzas'
import { hoyGT } from '../lib/constants'
import { useCategorias } from '../hooks/useCategorias'

interface Props { userId: string }

const DIAS = Array.from({ length: 28 }, (_, i) => i + 1)

export default function PagosRecurrentesPage({ userId }: Props) {
  const { categoriasGasto } = useCategorias(userId)
  const { pagos, loading, addPago, updatePago, deletePago } = usePagosRecurrentes(userId)
  const { cuentas } = useCuentas(userId)

  const [showAdd, setShowAdd] = useState(false)
  const [addNombre, setAddNombre] = useState('')
  const [addMonto, setAddMonto] = useState('')
  const [addDia, setAddDia] = useState(1)
  const [addCuenta, setAddCuenta] = useState('')
  const [addCategoria, setAddCategoria] = useState('Suscripciones')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editMonto, setEditMonto] = useState('')
  const [editDia, setEditDia] = useState(1)
  const [editCuenta, setEditCuenta] = useState('')
  const [editCategoria, setEditCategoria] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  // Día actual GT para mostrar estado (vencido / próximo)
  const todayDay = parseInt(hoyGT().split('-')[2], 10)
  const todayStr = hoyGT()
  const mesActualPrefix = todayStr.substring(0, 7)

  const cuentaNombre = useMemo(() => {
    const map: Record<string, string> = {}
    cuentas.forEach(c => { map[c.id] = c.nombre })
    return map
  }, [cuentas])

  const openAdd = () => {
    setAddNombre('')
    setAddMonto('')
    setAddDia(1)
    setAddCuenta(cuentas[0]?.id ?? '')
    setAddCategoria('Suscripciones')
    setAddError('')
    setShowAdd(true)
  }

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseFloat(addMonto)
    if (isNaN(val) || val <= 0) { setAddError('El monto debe ser mayor a 0'); return }
    if (!addNombre.trim()) { setAddError('Ingresa un nombre'); return }
    if (!addCuenta) { setAddError('Selecciona una cuenta'); return }
    setAddSaving(true)
    setAddError('')
    const { error } = await addPago({
      nombre: addNombre.trim(),
      monto: toCentavos(val),
      dia_del_mes: addDia,
      cuenta_id: addCuenta,
      categoria: addCategoria,
    })
    if (error) { setAddError(String(error)); setAddSaving(false); return }
    setShowAdd(false)
    setAddSaving(false)
  }

  const openEdit = (p: typeof pagos[0]) => {
    setEditingId(p.id)
    setEditNombre(p.nombre)
    setEditMonto(String(p.monto / 100))
    setEditDia(p.dia_del_mes)
    setEditCuenta(p.cuenta_id)
    setEditCategoria(p.categoria)
    setEditError('')
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingId) return
    const val = parseFloat(editMonto)
    if (isNaN(val) || val <= 0) { setEditError('El monto debe ser mayor a 0'); return }
    setEditSaving(true)
    setEditError('')
    const { error } = await updatePago(editingId, {
      nombre: editNombre.trim(),
      monto: toCentavos(val),
      dia_del_mes: editDia,
      cuenta_id: editCuenta,
      categoria: editCategoria,
    })
    if (error) { setEditError(error.message); setEditSaving(false); return }
    setEditingId(null)
    setEditSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (pendingDelete === id) {
      setPendingDelete(null)
      await deletePago(id)
    } else {
      setPendingDelete(id)
      setTimeout(() => setPendingDelete(p => p === id ? null : p), 3000)
    }
  }

  // Estado del pago: 'aplicado' | 'pendiente' | 'proximo'
  const estadoPago = (p: typeof pagos[0]) => {
    const yaAplicado = p.ultima_aplicacion?.startsWith(mesActualPrefix)
    if (yaAplicado) return 'aplicado'
    if (p.dia_del_mes <= todayDay) return 'pendiente'
    return 'proximo'
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <p className="text-muted text-center">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-white font-semibold text-lg">Pagos Fijos</h1>
          <p className="text-muted text-xs mt-0.5">Se aplican automáticamente cada mes</p>
        </div>
        <button
          onClick={openAdd}
          className="bg-accent text-bg font-semibold text-sm px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
        >
          + Agregar
        </button>
      </div>

      {/* Empty state */}
      {pagos.length === 0 && (
        <div className="bg-surface rounded-2xl p-8 text-center space-y-4">
          <p className="text-white font-medium">Sin pagos fijos aún</p>
          <p className="text-muted text-sm">Configura tus pagos recurrentes (renta, gym, suscripciones…) y se aplicarán solos cada mes.</p>
          <button
            onClick={openAdd}
            className="bg-accent text-bg font-semibold px-6 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
          >
            + Agregar pago fijo
          </button>
        </div>
      )}

      {/* Lista */}
      {pagos.map(p => {
        const estado = estadoPago(p)
        return (
          <div key={p.id} className="bg-surface rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white text-sm font-medium">{p.nombre}</span>
                  {estado === 'aplicado' && (
                    <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded-full">✓ aplicado</span>
                  )}
                  {estado === 'pendiente' && (
                    <span className="text-xs bg-yellow-400/10 text-yellow-400 px-2 py-0.5 rounded-full">pendiente</span>
                  )}
                </div>
                <p className="text-muted text-xs mt-1">
                  Día {p.dia_del_mes} · {p.categoria} · {cuentaNombre[p.cuenta_id] ?? '—'}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-danger font-mono text-sm font-semibold">-{formatQ(p.monto)}</span>
                <button
                  onClick={() => openEdit(p)}
                  className="text-xs px-2 py-1 rounded-lg text-muted hover:text-accent transition-colors"
                  aria-label="Editar"
                >✎</button>
                <button
                  onClick={() => handleDelete(p.id)}
                  className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                    pendingDelete === p.id ? 'bg-danger text-white' : 'text-muted hover:text-danger'
                  }`}
                >
                  {pendingDelete === p.id ? 'Confirmar' : '×'}
                </button>
              </div>
            </div>
          </div>
        )
      })}

      {/* Modal agregar */}
      {showAdd && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}
        >
          <div className="bg-surface w-full max-w-lg rounded-t-3xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-white font-semibold">Nuevo pago fijo</h2>
              <button onClick={() => setShowAdd(false)} className="text-muted text-xl">×</button>
            </div>
            <form onSubmit={handleAddSubmit} className="space-y-3">
              <div>
                <label className="text-muted text-xs mb-1 block">Nombre</label>
                <input
                  type="text"
                  value={addNombre}
                  onChange={e => setAddNombre(e.target.value)}
                  required
                  placeholder="ej. Netflix, Gym, Renta"
                  className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-muted text-xs mb-1 block">Monto (Q)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={addMonto}
                    onChange={e => setAddMonto(e.target.value)}
                    required
                    placeholder="0.00"
                    className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-muted text-xs mb-1 block">Día del mes</label>
                  <select
                    value={addDia}
                    onChange={e => setAddDia(Number(e.target.value))}
                    className="w-full bg-bg border border-muted/30 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-accent"
                  >
                    {DIAS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-muted text-xs mb-1 block">Cuenta a debitar</label>
                <select
                  value={addCuenta}
                  onChange={e => setAddCuenta(e.target.value)}
                  required
                  className="w-full bg-bg border border-muted/30 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-accent"
                >
                  <option value="">Seleccionar</option>
                  {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-muted text-xs mb-1 block">Categoría</label>
                <select
                  value={addCategoria}
                  onChange={e => setAddCategoria(e.target.value)}
                  className="w-full bg-bg border border-muted/30 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-accent"
                >
                  {categoriasGasto.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {addError && <p className="text-danger text-xs">{addError}</p>}
              <button
                type="submit"
                disabled={addSaving}
                className="w-full bg-accent text-bg font-semibold py-3 rounded-xl hover:opacity-90 disabled:opacity-50"
              >
                {addSaving ? 'Guardando...' : 'Guardar pago fijo'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal editar */}
      {editingId && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setEditingId(null) }}
        >
          <div className="bg-surface w-full max-w-lg rounded-t-3xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-white font-semibold">Editar pago fijo</h2>
              <button onClick={() => setEditingId(null)} className="text-muted text-xl">×</button>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-3">
              <div>
                <label className="text-muted text-xs mb-1 block">Nombre</label>
                <input
                  type="text"
                  value={editNombre}
                  onChange={e => setEditNombre(e.target.value)}
                  required
                  className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-muted text-xs mb-1 block">Monto (Q)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={editMonto}
                    onChange={e => setEditMonto(e.target.value)}
                    required
                    className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-muted text-xs mb-1 block">Día del mes</label>
                  <select
                    value={editDia}
                    onChange={e => setEditDia(Number(e.target.value))}
                    className="w-full bg-bg border border-muted/30 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-accent"
                  >
                    {DIAS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-muted text-xs mb-1 block">Cuenta a debitar</label>
                <select
                  value={editCuenta}
                  onChange={e => setEditCuenta(e.target.value)}
                  className="w-full bg-bg border border-muted/30 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-accent"
                >
                  {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-muted text-xs mb-1 block">Categoría</label>
                <select
                  value={editCategoria}
                  onChange={e => setEditCategoria(e.target.value)}
                  className="w-full bg-bg border border-muted/30 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-accent"
                >
                  {categoriasGasto.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {editError && <p className="text-danger text-xs">{editError}</p>}
              <button
                type="submit"
                disabled={editSaving}
                className="w-full bg-accent text-bg font-semibold py-3 rounded-xl hover:opacity-90 disabled:opacity-50"
              >
                {editSaving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
