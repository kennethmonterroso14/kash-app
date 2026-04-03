import { useState, useRef, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { useCuentas } from '../hooks/useCuentas'
import { useTransacciones, type Transaccion } from '../hooks/useTransacciones'
import { formatQ } from '../lib/finanzas'
import { toCentavos } from '../lib/finanzas'
import { CAT_COLORS, CATEGORIAS_GASTO, CATEGORIAS_INGRESO, MESES, hoyGT, mesActual } from '../lib/constants'

interface Props { user: User }

type TipoTxn = 'gasto' | 'ingreso' | 'ajuste'

export default function TransaccionesPage({ user }: Props) {
  const [mes, setMes] = useState(mesActual())
  const { cuentas } = useCuentas(user.id)
  const { txns, loading, addTxn, deleteTxn, restoreTxn, updateTxn } = useTransacciones(user.id, mes)

  const [showForm, setShowForm] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [lastDeleted, setLastDeleted] = useState<Transaccion | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [tipo, setTipo] = useState<TipoTxn>('gasto')
  const [fecha, setFecha] = useState(hoyGT())
  const [cantidad, setCantidad] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [categoria, setCategoria] = useState('Comida/Restaurantes')
  const [cuentaId, setCuentaId] = useState(cuentas[0]?.id ?? '')
  const [saving, setSaving] = useState(false)

  const [filterCuenta, setFilterCuenta] = useState<string>('') // '' = all
  const [filterTipo, setFilterTipo]   = useState<string>('') // '' = all
  const [filterBusqueda, setFilterBusqueda] = useState('')

  const [editingTxn, setEditingTxn] = useState<Transaccion | null>(null)
  const [editCantidad, setEditCantidad] = useState('')
  const [editDescripcion, setEditDescripcion] = useState('')
  const [editCategoria, setEditCategoria] = useState('')
  const [editFecha, setEditFecha] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const txnsFiltrados = useMemo(() => {
    return txns.filter(t => {
      if (filterCuenta && t.cuenta_id !== filterCuenta) return false
      if (filterTipo && t.tipo !== filterTipo) return false
      if (filterBusqueda && !t.descripcion.toLowerCase().includes(filterBusqueda.toLowerCase())) return false
      return true
    })
  }, [txns, filterCuenta, filterTipo, filterBusqueda])

  const handleExportCSV = () => {
    const headers = ['fecha', 'descripcion', 'categoria', 'tipo', 'cantidad_Q', 'cuenta']
    const getCuentaNombre = (id: string) => cuentas.find(c => c.id === id)?.nombre ?? id
    const rows = txnsFiltrados.map(t => [
      t.fecha,
      `"${t.descripcion.replace(/"/g, '""')}"`,
      t.categoria,
      t.tipo,
      (t.cantidad / 100).toFixed(2),
      getCuentaNombre(t.cuenta_id),
    ].join(','))
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kash_${mes}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const cats = tipo === 'ingreso' ? CATEGORIAS_INGRESO
    : tipo === 'ajuste' ? ['Ajuste de cuenta']
    : CATEGORIAS_GASTO

  const handleAddTxn = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseFloat(cantidad)
    if (isNaN(val) || val <= 0 || !descripcion || !cuentaId) return
    setSaving(true)

    const centavos = toCentavos(val)
    const cantidadFinal = tipo === 'gasto' ? -centavos : centavos

    await addTxn({ cuenta_id: cuentaId, cantidad: cantidadFinal, descripcion, categoria, tipo, fecha })

    setCantidad('')
    setDescripcion('')
    setFecha(hoyGT())
    setShowForm(false)
    setSaving(false)
  }

  const handleDelete = (id: string) => {
    if (pendingDelete === id) {
      // Segundo tap — confirmar eliminación
      const txn = txns.find(t => t.id === id)!
      setPendingDelete(null)
      deleteTxn(id)
      setLastDeleted(txn)
      if (undoTimer.current) clearTimeout(undoTimer.current)
      undoTimer.current = setTimeout(() => setLastDeleted(null), 6000)
    } else {
      setPendingDelete(id)
      setTimeout(() => setPendingDelete(p => p === id ? null : p), 3000)
    }
  }

  const handleEditOpen = (t: Transaccion) => {
    setEditingTxn(t)
    setEditCantidad(String(Math.abs(t.cantidad) / 100))
    setEditDescripcion(t.descripcion)
    setEditCategoria(t.categoria)
    setEditFecha(t.fecha)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTxn) return
    const val = parseFloat(editCantidad)
    if (isNaN(val) || val <= 0) return
    setEditSaving(true)
    const centavos = toCentavos(val)
    const cantidadFinal = editingTxn.tipo === 'gasto' ? -centavos : centavos
    await updateTxn(editingTxn.id, {
      cantidad: cantidadFinal,
      descripcion: editDescripcion,
      categoria: editCategoria,
      fecha: editFecha,
    })
    setEditingTxn(null)
    setEditSaving(false)
  }

  const handleUndo = async () => {
    if (!lastDeleted) return
    if (undoTimer.current) clearTimeout(undoTimer.current)
    const txn = lastDeleted
    setLastDeleted(null)
    await restoreTxn(txn)
  }

  const [anio, mesNum] = mes.split('-').map(Number)
  const mesLabel = `${MESES[mesNum - 1]} ${anio}`

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const d = new Date(anio, mesNum - 2, 1)
              setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
            }}
            className="text-muted hover:text-white p-1"
          >←</button>
          <span className="text-white font-medium">{mesLabel}</span>
          <button
            onClick={() => {
              const d = new Date(anio, mesNum, 1)
              setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
            }}
            className="text-muted hover:text-white p-1"
          >→</button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportCSV}
            disabled={txnsFiltrados.length === 0}
            className="text-muted text-sm px-3 py-2 rounded-xl border border-muted/30 hover:text-white hover:border-muted transition-colors disabled:opacity-30"
          >
            ↓ CSV
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="bg-accent text-bg font-semibold text-sm px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
          >
            + Agregar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Buscar..."
          value={filterBusqueda}
          onChange={e => setFilterBusqueda(e.target.value)}
          className="flex-1 min-w-32 bg-surface border border-muted/30 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
        />
        <select
          value={filterTipo}
          onChange={e => setFilterTipo(e.target.value)}
          className="bg-surface border border-muted/30 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
        >
          <option value="">Todos</option>
          <option value="gasto">Gastos</option>
          <option value="ingreso">Ingresos</option>
          <option value="ajuste">Ajustes</option>
        </select>
        <select
          value={filterCuenta}
          onChange={e => setFilterCuenta(e.target.value)}
          className="bg-surface border border-muted/30 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
        >
          <option value="">Todas</option>
          {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      {/* Lista de transacciones */}
      {loading && <p className="text-muted text-center py-8">Cargando...</p>}

      {!loading && txnsFiltrados.length === 0 && (
        <div className="bg-surface rounded-2xl p-8 text-center">
          <p className="text-muted">Sin movimientos en {mesLabel}</p>
        </div>
      )}

      <div className="space-y-2">
        {txnsFiltrados.map(t => (
          <div key={t.id} className="bg-surface rounded-2xl px-4 py-3 flex items-center gap-3">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: CAT_COLORS[t.categoria] ?? '#6b7590' }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm truncate">{t.descripcion}</p>
              <p className="text-muted text-xs">{t.categoria} · {t.fecha}</p>
            </div>
            <span className={`font-mono text-sm font-semibold flex-shrink-0 ${t.cantidad > 0 ? 'text-accent' : 'text-danger'}`}>
              {t.cantidad > 0 ? '+' : ''}{formatQ(t.cantidad)}
            </span>
            <button
              onClick={() => handleEditOpen(t)}
              className="text-xs px-2 py-1 rounded-lg text-muted hover:text-accent transition-colors flex-shrink-0"
              aria-label="Editar"
            >
              ✎
            </button>
            <button
              onClick={() => handleDelete(t.id)}
              className={`text-xs px-2 py-1 rounded-lg transition-colors flex-shrink-0 ${
                pendingDelete === t.id
                  ? 'bg-danger text-white'
                  : 'text-muted hover:text-danger'
              }`}
            >
              {pendingDelete === t.id ? 'Confirmar' : '×'}
            </button>
          </div>
        ))}
      </div>

      {/* Undo toast */}
      {lastDeleted && (
        <div className="fixed bottom-24 left-4 right-4 max-w-lg mx-auto bg-surface border border-muted/30 rounded-2xl px-4 py-3 flex items-center justify-between shadow-lg">
          <span className="text-white text-sm">Movimiento eliminado</span>
          <button
            onClick={handleUndo}
            className="text-accent text-sm font-semibold hover:opacity-80"
          >
            Deshacer
          </button>
        </div>
      )}

      {/* Modal editar */}
      {editingTxn && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setEditingTxn(null) }}
        >
          <div className="bg-surface w-full max-w-lg rounded-t-3xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-white font-semibold">Editar movimiento</h2>
              <button onClick={() => setEditingTxn(null)} className="text-muted text-xl">×</button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3">
              {/* Cantidad */}
              <div>
                <label className="text-muted text-xs mb-1 block">
                  Monto (Q) — {editingTxn.tipo}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={editCantidad}
                  onChange={e => setEditCantidad(e.target.value)}
                  required
                  placeholder="0.00"
                  className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-xl font-mono focus:outline-none focus:border-accent"
                />
              </div>

              {/* Descripción */}
              <div>
                <label className="text-muted text-xs mb-1 block">Descripción</label>
                <input
                  type="text"
                  value={editDescripcion}
                  onChange={e => setEditDescripcion(e.target.value)}
                  required
                  placeholder="¿En qué?"
                  className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent"
                />
              </div>

              {/* Categoría */}
              <div>
                <label className="text-muted text-xs mb-1 block">Categoría</label>
                <select
                  value={editCategoria}
                  onChange={e => setEditCategoria(e.target.value)}
                  className="w-full bg-bg border border-muted/30 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-accent"
                >
                  {(editingTxn.tipo === 'ingreso'
                    ? CATEGORIAS_INGRESO
                    : editingTxn.tipo === 'ajuste'
                    ? ['Ajuste de cuenta', 'Transferencia']
                    : CATEGORIAS_GASTO
                  ).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Fecha */}
              <div>
                <label className="text-muted text-xs mb-1 block">Fecha</label>
                <input
                  type="date"
                  value={editFecha}
                  onChange={e => setEditFecha(e.target.value)}
                  className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent"
                />
              </div>

              <button
                type="submit"
                disabled={editSaving}
                className="w-full font-semibold py-3 rounded-xl bg-accent text-bg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {editSaving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal agregar */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}
        >
          <div className="bg-surface w-full max-w-lg rounded-t-3xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-white font-semibold">Nuevo movimiento</h2>
              <button onClick={() => setShowForm(false)} className="text-muted text-xl">×</button>
            </div>

            {/* Tipo */}
            <div className="flex gap-1 bg-bg rounded-xl p-1">
              {(['gasto', 'ingreso', 'ajuste'] as TipoTxn[]).map(t => (
                <button
                  key={t}
                  onClick={() => {
                    setTipo(t)
                    setCategoria(t === 'ingreso' ? 'Ingreso' : t === 'ajuste' ? 'Ajuste de cuenta' : 'Comida/Restaurantes')
                  }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                    tipo === t
                      ? t === 'ingreso' ? 'bg-accent text-bg' : t === 'gasto' ? 'bg-danger text-white' : 'bg-muted text-white'
                      : 'text-muted'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <form onSubmit={handleAddTxn} className="space-y-3">
              {/* Cantidad */}
              <div>
                <label className="text-muted text-xs mb-1 block">Cantidad (Q)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={cantidad}
                  onChange={e => setCantidad(e.target.value)}
                  required
                  placeholder="0.00"
                  className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-xl font-mono focus:outline-none focus:border-accent"
                />
              </div>

              {/* Descripción */}
              <div>
                <label className="text-muted text-xs mb-1 block">Descripción</label>
                <input
                  type="text"
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                  required
                  placeholder="¿En qué?"
                  className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent"
                />
              </div>

              {/* Categoría + Cuenta */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-muted text-xs mb-1 block">Categoría</label>
                  <select
                    value={categoria}
                    onChange={e => setCategoria(e.target.value)}
                    className="w-full bg-bg border border-muted/30 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-accent"
                  >
                    {cats.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-muted text-xs mb-1 block">Cuenta</label>
                  <select
                    value={cuentaId}
                    onChange={e => setCuentaId(e.target.value)}
                    className="w-full bg-bg border border-muted/30 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-accent"
                  >
                    {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
              </div>

              {/* Fecha */}
              <div>
                <label className="text-muted text-xs mb-1 block">Fecha</label>
                <input
                  type="date"
                  value={fecha}
                  onChange={e => setFecha(e.target.value)}
                  className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className={`w-full font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 ${
                  tipo === 'ingreso' ? 'bg-accent text-bg' : tipo === 'gasto' ? 'bg-danger text-white' : 'bg-muted text-white'
                }`}
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
