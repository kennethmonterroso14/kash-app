import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useTransacciones } from '../hooks/useTransacciones'
import { formatQ, toCentavos, calcEstadoPresupuesto } from '../lib/finanzas'
import { MESES, mesActual } from '../lib/constants'
import { useCategorias } from '../hooks/useCategorias'

interface Props { userId: string }

interface Presupuesto {
  id: string
  categoria: string
  monto_limite: number
  mes: string
}

export default function BudgetPage({ userId }: Props) {
  const { categoriasGasto } = useCategorias(userId)
  const [mes, setMes] = useState(mesActual())
  const { txns } = useTransacciones(userId, mes)
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([])
  const [loading, setLoading] = useState(true)

  // Add modal state
  const [showAdd, setShowAdd] = useState(false)
  const [addCategoria, setAddCategoria] = useState('')
  const [addMonto, setAddMonto] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  // Edit modal state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMonto, setEditMonto] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Delete state (2-step)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const [anio, mesNum] = mes.split('-').map(Number)
  const mesLabel = `${MESES[mesNum - 1]} ${anio}`
  const mesInicio = `${mes}-01`

  useEffect(() => {
    setLoading(true)
    supabase
      .from('presupuestos')
      .select('id, categoria, monto_limite, mes')
      .eq('user_id', userId)
      .eq('mes', mesInicio)
      .eq('activo', true)
      .then(({ data }) => {
        setPresupuestos(data ?? [])
        setLoading(false)
      })
  }, [userId, mesInicio])

  // Gastos por categoría del mes
  const gastadoPorCat = useMemo(() => {
    const map: Record<string, number> = {}
    txns.filter(t => t.tipo === 'gasto').forEach(t => {
      map[t.categoria] = (map[t.categoria] ?? 0) + Math.abs(t.cantidad)
    })
    return map
  }, [txns])

  // Categories available to add (not already budgeted)
  const categoriasDisponibles = useMemo(() => {
    const budgeted = new Set(presupuestos.map(p => p.categoria))
    return categoriasGasto.filter(c => !budgeted.has(c))
  }, [presupuestos, categoriasGasto])

  const handlePrevMes = () => {
    const d = new Date(anio, mesNum - 2, 1)
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const handleNextMes = () => {
    const d = new Date(anio, mesNum, 1)
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const openAdd = () => {
    setAddCategoria(categoriasDisponibles[0] ?? '')
    setAddMonto('')
    setAddError('')
    setShowAdd(true)
  }

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseFloat(addMonto)
    if (isNaN(val) || val <= 0) {
      setAddError('El monto debe ser mayor a 0')
      return
    }
    if (!addCategoria) {
      setAddError('Selecciona una categoría')
      return
    }
    setAddSaving(true)
    setAddError('')

    const centavos = toCentavos(val)
    const { data, error } = await supabase
      .from('presupuestos')
      .upsert(
        { user_id: userId, categoria: addCategoria, monto_limite: centavos, mes: mesInicio, activo: true },
        { onConflict: 'user_id,categoria,mes' }
      )
      .select('id, categoria, monto_limite, mes')
      .single()

    if (error) {
      setAddError(error.message)
      setAddSaving(false)
      return
    }

    if (data) {
      setPresupuestos(prev => {
        const exists = prev.find(p => p.id === data.id)
        if (exists) return prev.map(p => p.id === data.id ? data : p)
        return [...prev, data]
      })
    }

    setShowAdd(false)
    setAddSaving(false)
    setAddMonto('')
  }

  const openEdit = (p: Presupuesto) => {
    setEditingId(p.id)
    setEditMonto(String(p.monto_limite / 100))
    setEditError('')
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingId) return
    const val = parseFloat(editMonto)
    if (isNaN(val) || val <= 0) {
      setEditError('El monto debe ser mayor a 0')
      return
    }
    setEditSaving(true)
    setEditError('')

    const centavos = toCentavos(val)
    const { error } = await supabase
      .from('presupuestos')
      .update({ monto_limite: centavos })
      .eq('id', editingId)

    if (error) {
      setEditError(error.message)
      setEditSaving(false)
      return
    }

    setPresupuestos(prev =>
      prev.map(p => p.id === editingId ? { ...p, monto_limite: centavos } : p)
    )
    setEditingId(null)
    setEditSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (pendingDelete === id) {
      setPendingDelete(null)
      await supabase.from('presupuestos').delete().eq('id', id)
      setPresupuestos(prev => prev.filter(p => p.id !== id))
    } else {
      setPendingDelete(id)
      setTimeout(() => setPendingDelete(p => p === id ? null : p), 3000)
    }
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
        <div className="flex items-center gap-3">
          <button onClick={handlePrevMes} className="text-muted hover:text-white p-1">←</button>
          <span className="text-white font-medium">{mesLabel}</span>
          <button onClick={handleNextMes} className="text-muted hover:text-white p-1">→</button>
        </div>
        <button
          onClick={openAdd}
          disabled={categoriasDisponibles.length === 0}
          className="bg-accent text-bg font-semibold text-sm px-4 py-2 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-30"
        >
          + Categoría
        </button>
      </div>

      {/* Empty state */}
      {presupuestos.length === 0 && (
        <div className="bg-surface rounded-2xl p-8 text-center space-y-4">
          <p className="text-muted text-sm">Sin presupuestos para {mesLabel}</p>
          <button
            onClick={openAdd}
            disabled={categoriasDisponibles.length === 0}
            className="bg-accent text-bg font-semibold px-6 py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-30"
          >
            + Categoría
          </button>
        </div>
      )}

      {/* Budget cards */}
      {presupuestos.map(p => {
        const gastado = gastadoPorCat[p.categoria] ?? 0
        const { pct, estado, restante } = calcEstadoPresupuesto(gastado, p.monto_limite)
        const barColor = estado === 'excedido' ? '#f87171' : estado === 'alerta' ? '#fbbf24' : '#4ade80'

        return (
          <div key={p.id} className="bg-surface rounded-2xl p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-white text-sm font-medium flex-1">{p.categoria}</span>
              <div className="flex items-center gap-1">
                <span className={`text-xs font-mono font-semibold ${
                  estado === 'excedido' ? 'text-danger' : estado === 'alerta' ? 'text-yellow-400' : 'text-success'
                }`}>
                  {pct}%
                </span>
                <button
                  onClick={() => openEdit(p)}
                  className="text-xs px-2 py-1 rounded-lg text-muted hover:text-accent transition-colors"
                  aria-label="Editar"
                >
                  ✎
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                    pendingDelete === p.id
                      ? 'bg-danger text-white'
                      : 'text-muted hover:text-danger'
                  }`}
                >
                  {pendingDelete === p.id ? 'Confirmar' : '×'}
                </button>
              </div>
            </div>
            <div className="h-2 bg-bg rounded-full overflow-hidden mb-2">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(pct, 100)}%`, background: barColor }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted">
              <span>{formatQ(gastado)} gastado</span>
              <span>
                {restante >= 0 ? `${formatQ(restante)} restante` : `${formatQ(Math.abs(restante))} excedido`}
              </span>
            </div>
            <div className="text-xs text-muted mt-0.5 text-right">Límite: {formatQ(p.monto_limite)}</div>
          </div>
        )
      })}

      {/* Add modal (bottom sheet) */}
      {showAdd && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}
        >
          <div className="bg-surface w-full max-w-lg rounded-t-3xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-white font-semibold">Nuevo presupuesto</h2>
              <button onClick={() => setShowAdd(false)} className="text-muted text-xl">×</button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3">
              <div>
                <label className="text-muted text-xs mb-1 block">Categoría</label>
                <select
                  value={addCategoria}
                  onChange={e => setAddCategoria(e.target.value)}
                  required
                  className="w-full bg-bg border border-muted/30 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-accent"
                >
                  {categoriasDisponibles.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-muted text-xs mb-1 block">Monto límite (Q)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={addMonto}
                  onChange={e => setAddMonto(e.target.value)}
                  required
                  placeholder="0.00"
                  className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-xl font-mono focus:outline-none focus:border-accent"
                />
              </div>

              {addError && <p className="text-danger text-xs">{addError}</p>}

              <button
                type="submit"
                disabled={addSaving}
                className="w-full bg-accent text-bg font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {addSaving ? 'Guardando...' : 'Guardar presupuesto'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal (bottom sheet) */}
      {editingId && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setEditingId(null) }}
        >
          <div className="bg-surface w-full max-w-lg rounded-t-3xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-white font-semibold">
                Editar límite — {presupuestos.find(p => p.id === editingId)?.categoria}
              </h2>
              <button onClick={() => setEditingId(null)} className="text-muted text-xl">×</button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3">
              <div>
                <label className="text-muted text-xs mb-1 block">Monto límite (Q)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={editMonto}
                  onChange={e => setEditMonto(e.target.value)}
                  required
                  placeholder="0.00"
                  className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-xl font-mono focus:outline-none focus:border-accent"
                />
              </div>

              {editError && <p className="text-danger text-xs">{editError}</p>}

              <button
                type="submit"
                disabled={editSaving}
                className="w-full bg-accent text-bg font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
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
