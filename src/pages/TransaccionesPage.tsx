import { useState, useRef, useMemo, useEffect } from 'react'
import { useTransacciones, type Transaccion } from '../hooks/useTransacciones'
import { formatQ } from '../lib/finanzas'
import { toCentavos } from '../lib/finanzas'
import { MESES, hoyGT, mesActual, COLOR_CATEGORIA_FALLBACK } from '../lib/constants'
import { useSesion } from '../context/sesion'
import { colores } from '../lib/tokens'

type TipoTxn = 'gasto' | 'ingreso' | 'ajuste'
type TipoForm = 'gasto' | 'ingreso' | 'transferencia' | 'gasto_tc'

export default function TransaccionesPage() {
  const {
    userId, cuentas, categoriasGasto, categoriasIngreso, coloresCategorias,
    resumenTCs, registrarCargo,
  } = useSesion()
  const [mes, setMes] = useState(mesActual())
  const { txns, loading, addTxn, deleteTxn, restoreTxn, updateTxn, addTransferencia } = useTransacciones(userId, mes)

  const [showForm, setShowForm] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [lastDeleted, setLastDeleted] = useState<Transaccion | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [tipo, setTipo] = useState<TipoForm>('gasto')
  const [fecha, setFecha] = useState(hoyGT())
  const [cantidad, setCantidad] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [categoria, setCategoria] = useState('Comida/Restaurantes')
  const [cuentaId, setCuentaId] = useState('')

  // Set default account once cuentas load
  useEffect(() => {
    if (!cuentaId && cuentas.length > 0) setCuentaId(cuentas[0].id)
  }, [cuentas, cuentaId])
  const [saving, setSaving] = useState(false)
  const [tcId, setTcId] = useState('')

  // Default primera TC cuando carguen
  useEffect(() => {
    if (!tcId && resumenTCs.length > 0) setTcId(resumenTCs[0].tc.id)
  }, [resumenTCs, tcId])

  const [transferDe, setTransferDe] = useState('')
  const [transferA, setTransferA]   = useState('')
  const [transferSaving, setTransferSaving] = useState(false)

  const [filterCuenta, setFilterCuenta] = useState<string>('') // '' = all
  const [filterTipo, setFilterTipo]   = useState<string>('') // '' = all
  const [filterBusqueda, setFilterBusqueda] = useState('')

  const [editingTxn, setEditingTxn] = useState<Transaccion | null>(null)
  const [editCantidad, setEditCantidad] = useState('')
  const [editDescripcion, setEditDescripcion] = useState('')
  const [editCategoria, setEditCategoria] = useState('')
  const [editFecha, setEditFecha] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Error de guardado para alta de movimientos y transferencias
  const [formError, setFormError] = useState('')

  const txnsFiltrados = useMemo(() => {
    return txns.filter(t => {
      if (filterCuenta && t.cuenta_id !== filterCuenta) return false
      if (filterTipo && t.tipo !== filterTipo) return false
      if (filterBusqueda && !t.descripcion.toLowerCase().includes(filterBusqueda.toLowerCase())) return false
      return true
    })
  }, [txns, filterCuenta, filterTipo, filterBusqueda])

  // Escapa un campo CSV: comillas siempre, y neutraliza la inyección de fórmulas
  // (Excel/Sheets evalúan un campo que empieza con = + - @, tab o CR).
  const csvCampo = (valor: string | number) => {
    const s = String(valor)
    const seguro = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
    return `"${seguro.replace(/"/g, '""')}"`
  }

  const handleExportCSV = () => {
    const headers = ['fecha', 'descripcion', 'categoria', 'tipo', 'cantidad_Q', 'cuenta']
    const getCuentaNombre = (id: string) => cuentas.find(c => c.id === id)?.nombre ?? id
    const getTarjetaNombre = (id: string) =>
      resumenTCs.find(r => r.tc.id === id)?.tc.nombre ?? id
    const rows = txnsFiltrados.map(t => [
      csvCampo(t.fecha),
      csvCampo(t.descripcion),
      csvCampo(t.categoria),
      csvCampo(t.tipo),
      csvCampo((t.cantidad / 100).toFixed(2)),
      csvCampo(
        t.cuenta_id
          ? getCuentaNombre(t.cuenta_id)
          : t.tarjeta_id
            ? getTarjetaNombre(t.tarjeta_id)
            : 'TC',
      ),
    ].join(','))
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vorta_${mes}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const cats = tipo === 'ingreso' ? categoriasIngreso : categoriasGasto

  const handleAddTxn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (tipo === 'transferencia') return
    setSaving(true)

    setFormError('')

    if (tipo === 'gasto_tc') {
      if (!tcId) { setSaving(false); setFormError('Selecciona una tarjeta'); return }
      const monto = parseFloat(cantidad)
      if (isNaN(monto) || monto <= 0) { setSaving(false); setFormError('Ingresa un monto mayor a Q0'); return }
      try {
        await registrarCargo({
          tarjeta_id:  tcId,
          monto:       toCentavos(monto),
          descripcion: descripcion.trim() || categoria,
          categoria,
          fecha,
        })
        setShowForm(false)
        setCantidad(''); setDescripcion(''); setCategoria(categoriasGasto[0])
      } catch (e: unknown) {
        setFormError(e instanceof Error ? e.message : 'No se pudo registrar el cargo')
      } finally {
        setSaving(false)
      }
      return
    }

    const val = parseFloat(cantidad)
    if (isNaN(val) || val <= 0) { setSaving(false); setFormError('Ingresa un monto mayor a Q0'); return }
    if (!descripcion.trim()) { setSaving(false); setFormError('Agrega una descripción'); return }
    if (!cuentaId) { setSaving(false); setFormError('Selecciona una cuenta'); return }

    const centavos = toCentavos(val)
    const cantidadFinal = tipo === 'gasto' ? -centavos : centavos
    const tipoTxn: TipoTxn = tipo

    const { error } = await addTxn({ cuenta_id: cuentaId, cantidad: cantidadFinal, descripcion, categoria, tipo: tipoTxn, fecha })

    setSaving(false)
    if (error) {
      setFormError(typeof error === 'string' ? error : error.message)
      return
    }

    setCantidad('')
    setDescripcion('')
    setFecha(hoyGT())
    setShowForm(false)
  }

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    const val = parseFloat(cantidad)
    if (isNaN(val) || val <= 0) { setFormError('Ingresa un monto mayor a Q0'); return }
    if (!transferDe || !transferA) { setFormError('Selecciona ambas cuentas'); return }
    if (transferDe === transferA) { setFormError('Las cuentas deben ser distintas'); return }
    setTransferSaving(true)
    const { error } = await addTransferencia({
      deCuentaId: transferDe,
      aCuentaId: transferA,
      cantidad: toCentavos(val),
      descripcion: descripcion || 'Transferencia',
      fecha,
    })
    setTransferSaving(false)
    if (error) {
      setFormError(typeof error === 'string' ? error : error.message)
      return
    }
    setCantidad('')
    setDescripcion('')
    setFecha(hoyGT())
    setShowForm(false)
  }

  const handleDelete = async (id: string) => {
    if (pendingDelete === id) {
      // Segundo tap — confirmar eliminación
      const txn = txns.find(t => t.id === id)
      if (!txn) return
      setPendingDelete(null)
      // Se espera el resultado: el trigger de deuda puede rechazar la
      // eliminación de un movimiento de TC sin reparto registrado, y antes se
      // ofrecía "Deshacer" de un borrado que nunca ocurrió.
      const { error } = await deleteTxn(id)
      if (error) {
        setFormError(typeof error === 'string' ? error : error.message)
        return
      }
      setLastDeleted(txn)
      if (undoTimer.current) clearTimeout(undoTimer.current)
      undoTimer.current = setTimeout(() => setLastDeleted(null), 6000)
    } else {
      setPendingDelete(id)
      setTimeout(() => setPendingDelete(p => p === id ? null : p), 3000)
    }
  }

  // Los movimientos de TC los administra el trigger actualizar_deuda_tc, cuya rama
  // UPDATE solo contempla gasto_tc: editarlos desincroniza la deuda de la tarjeta.
  // Se corrigen borrando y volviendo a registrarlos desde Tarjetas.
  const esEditable = (t: Transaccion) => t.tipo !== 'gasto_tc' && t.tipo !== 'pago_tc'

  const handleEditOpen = (t: Transaccion) => {
    if (!esEditable(t)) return
    setEditError('')
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
    if (isNaN(val) || val <= 0) { setEditError('Ingresa un monto mayor a Q0'); return }
    setEditSaving(true)
    setEditError('')
    const centavos = toCentavos(val)
    // Preservar el signo guardado. Derivarlo del tipo volteaba el signo de todo lo
    // que no fuera 'gasto' (ajustes, patas de transferencia, movimientos de TC) y el
    // trigger de saldo aplicaba 2x el monto. 'ajuste' es legítimamente de cualquier signo.
    const cantidadFinal = editingTxn.cantidad < 0 ? -centavos : centavos
    const { error } = await updateTxn(editingTxn.id, {
      cantidad: cantidadFinal,
      descripcion: editDescripcion,
      categoria: editCategoria,
      fecha: editFecha,
    })
    setEditSaving(false)
    if (error) {
      setEditError(typeof error === 'string' ? error : error.message)
      return
    }
    setEditingTxn(null)
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
            className="text-textDim hover:text-text p-1"
          >←</button>
          <span className="text-text font-medium">{mesLabel}</span>
          <button
            onClick={() => {
              const d = new Date(anio, mesNum, 1)
              setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
            }}
            className="text-textDim hover:text-text p-1"
          >→</button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportCSV}
            disabled={txnsFiltrados.length === 0}
            className="text-textDim text-sm px-3 py-2 rounded-xl border border-canto hover:text-text hover:border-perimetro transition-colors disabled:opacity-30"
          >
            ↓ CSV
          </button>
          <button
            type="button"
            onClick={() => { setFormError(''); setShowForm(true) }}
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
          className="flex-1 min-w-32 bg-surface border border-canto rounded-xl px-3 py-2 text-text text-sm focus:outline-none focus:border-accent"
        />
        <select
          value={filterTipo}
          onChange={e => setFilterTipo(e.target.value)}
          className="bg-surface border border-canto rounded-xl px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
        >
          <option value="">Todos</option>
          <option value="gasto">Gastos</option>
          <option value="ingreso">Ingresos</option>
          <option value="ajuste">Ajustes</option>
        </select>
        <select
          value={filterCuenta}
          onChange={e => setFilterCuenta(e.target.value)}
          className="bg-surface border border-canto rounded-xl px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
        >
          <option value="">Todas</option>
          {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      {/* Errores de operaciones sobre la lista (p. ej. un borrado rechazado) */}
      {formError && !showForm && !editingTxn && (
        <div role="alert" className="text-danger text-sm bg-danger/10 rounded-xl px-4 py-2 mb-4 flex justify-between items-start gap-3">
          <span>{formError}</span>
          <button
            type="button"
            onClick={() => setFormError('')}
            aria-label="Cerrar aviso"
            className="text-danger/70 hover:text-danger leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Lista de transacciones */}
      {loading && <p className="text-textDim text-center py-8">Cargando...</p>}

      {!loading && txnsFiltrados.length === 0 && (
        <div className="bg-surface rounded-2xl p-8 text-center">
          <p className="text-textDim">Sin movimientos en {mesLabel}</p>
        </div>
      )}

      <div className="space-y-2">
        {txnsFiltrados.map(t => (
          <div key={t.id} className="bg-surface rounded-2xl px-4 py-3 flex items-center gap-3">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: coloresCategorias[t.categoria] ?? COLOR_CATEGORIA_FALLBACK }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-text text-sm truncate">{t.descripcion}</p>
              <p className="text-textDim text-xs">{t.categoria} · {t.fecha}</p>
            </div>
            <span className={`font-mono text-sm font-semibold flex-shrink-0 ${t.cantidad > 0 ? 'text-success' : 'text-danger'}`}>
              {t.cantidad > 0 ? '+' : ''}{formatQ(t.cantidad)}
            </span>
            {esEditable(t) && (
              <button
                type="button"
                onClick={() => handleEditOpen(t)}
                className="text-xs px-2 py-1 rounded-lg text-textDim hover:text-accent transition-colors flex-shrink-0"
                aria-label={`Editar ${t.descripcion}`}
              >
                ✎
              </button>
            )}
            <button
              type="button"
              onClick={() => handleDelete(t.id)}
              aria-label={pendingDelete === t.id ? 'Confirmar eliminación' : `Eliminar ${t.descripcion}`}
              className={`text-xs px-2 py-1 rounded-lg transition-colors flex-shrink-0 ${
                pendingDelete === t.id
                  ? 'bg-danger text-text'
                  : 'text-textDim hover:text-danger'
              }`}
            >
              {pendingDelete === t.id ? 'Confirmar' : '×'}
            </button>
          </div>
        ))}
      </div>

      {/* Undo toast */}
      {lastDeleted && (
        <div className="fixed bottom-24 left-4 right-4 max-w-lg mx-auto bg-surface border border-canto rounded-2xl px-4 py-3 flex items-center justify-between shadow-lg">
          <span className="text-text text-sm">Movimiento eliminado</span>
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
              <h2 className="text-text font-semibold">Editar movimiento</h2>
              <button onClick={() => setEditingTxn(null)} className="text-textDim text-xl">×</button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3">
              {/* Cantidad */}
              <div>
                <label className="text-textDim text-xs mb-1 block">
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
                  className="w-full bg-bg border border-canto rounded-xl px-4 py-3 text-text text-xl font-mono focus:outline-none focus:border-accent"
                />
              </div>

              {/* Descripción */}
              <div>
                <label className="text-textDim text-xs mb-1 block">Descripción</label>
                <input
                  type="text"
                  value={editDescripcion}
                  onChange={e => setEditDescripcion(e.target.value)}
                  required
                  placeholder="¿En qué?"
                  className="w-full bg-bg border border-canto rounded-xl px-4 py-3 text-text focus:outline-none focus:border-accent"
                />
              </div>

              {/* Categoría */}
              <div>
                <label className="text-textDim text-xs mb-1 block">Categoría</label>
                <select
                  value={editCategoria}
                  onChange={e => setEditCategoria(e.target.value)}
                  className="w-full bg-bg border border-canto rounded-xl px-3 py-3 text-text focus:outline-none focus:border-accent"
                >
                  {(editingTxn.tipo === 'ingreso'
                    ? categoriasIngreso
                    : editingTxn.tipo === 'ajuste'
                    ? ['Ajuste de cuenta', 'Transferencia']
                    : categoriasGasto
                  ).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Fecha */}
              <div>
                <label className="text-textDim text-xs mb-1 block">Fecha</label>
                <input
                  type="date"
                  value={editFecha}
                  onChange={e => setEditFecha(e.target.value)}
                  className="w-full bg-bg border border-canto rounded-xl px-4 py-3 text-text focus:outline-none focus:border-accent"
                />
              </div>

              {editError && (
                <p role="alert" className="text-danger text-sm bg-danger/10 rounded-xl px-4 py-2">{editError}</p>
              )}

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
              <h2 className="text-text font-semibold">Nuevo movimiento</h2>
              <button onClick={() => setShowForm(false)} className="text-textDim text-xl">×</button>
            </div>

            {/* Tipo */}
            <div className="flex gap-1 bg-bg rounded-xl p-1">
              {(['gasto', 'ingreso', 'gasto_tc', 'transferencia'] as TipoForm[]).map(t => (
                <button
                  key={t}
                  onClick={() => {
                    setTipo(t)
                    setCategoria(t === 'ingreso' ? 'Ingreso' : 'Comida/Restaurantes')
                    if (t === 'transferencia') {
                      setTransferDe('')
                      setTransferA('')
                    }
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    tipo === t
                      ? t === 'ingreso'  ? 'bg-accent text-bg'
                      : t === 'gasto'    ? 'bg-danger text-text'
                      : t === 'gasto_tc' ? 'bg-warning/20 text-warning'
                      :                    'text-text'
                      : 'text-textDim'
                  }`}
                  style={tipo === t && t === 'transferencia' ? { background: colores.accentAlt } : undefined}
                >
                  {t === 'gasto' ? 'Gasto' : t === 'ingreso' ? 'Ingreso' : t === 'gasto_tc' ? 'Cargo TC' : 'Transferencia'}
                </button>
              ))}
            </div>

            {tipo === 'transferencia' ? (
              <form onSubmit={handleTransfer} className="space-y-3">
                {/* Monto */}
                <div>
                  <label className="text-textDim text-xs mb-1 block">Monto (Q)</label>
                  <input type="number" step="0.01" min="0.01" value={cantidad}
                    onChange={e => setCantidad(e.target.value)} required placeholder="0.00"
                    className="w-full bg-bg border border-canto rounded-xl px-4 py-3 text-text text-xl font-mono focus:outline-none focus:border-accent" />
                </div>
                {/* De → A */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-textDim text-xs mb-1 block">De cuenta</label>
                    <select value={transferDe} onChange={e => setTransferDe(e.target.value)} required
                      className="w-full bg-bg border border-canto rounded-xl px-3 py-3 text-text focus:outline-none focus:border-accent">
                      <option value="">Seleccionar</option>
                      {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-textDim text-xs mb-1 block">A cuenta</label>
                    <select value={transferA} onChange={e => setTransferA(e.target.value)} required
                      className="w-full bg-bg border border-canto rounded-xl px-3 py-3 text-text focus:outline-none focus:border-accent">
                      <option value="">Seleccionar</option>
                      {cuentas.filter(c => c.id !== transferDe).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                </div>
                {/* Descripción opcional */}
                <div>
                  <label className="text-textDim text-xs mb-1 block">Descripción (opcional)</label>
                  <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)}
                    placeholder="ej. Ahorro mensual"
                    className="w-full bg-bg border border-canto rounded-xl px-4 py-3 text-text focus:outline-none focus:border-accent" />
                </div>
                {/* Fecha */}
                <div>
                  <label className="text-textDim text-xs mb-1 block">Fecha</label>
                  <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                    className="w-full bg-bg border border-canto rounded-xl px-4 py-3 text-text focus:outline-none focus:border-accent" />
                </div>
                {formError && (
                  <p role="alert" className="text-danger text-sm bg-danger/10 rounded-xl px-4 py-2">{formError}</p>
                )}
                <button type="submit" disabled={transferSaving || transferDe === transferA}
                  className="w-full bg-accentAlt text-text font-semibold py-3 rounded-xl hover:opacity-90 disabled:opacity-50">
                  {transferSaving ? 'Guardando...' : 'Transferir'}
                </button>
              </form>
            ) : (
            <form onSubmit={handleAddTxn} className="space-y-3">
              {/* Cantidad */}
              <div>
                <label className="text-textDim text-xs mb-1 block">Cantidad (Q)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={cantidad}
                  onChange={e => setCantidad(e.target.value)}
                  required
                  placeholder="0.00"
                  className="w-full bg-bg border border-canto rounded-xl px-4 py-3 text-text text-xl font-mono focus:outline-none focus:border-accent"
                />
              </div>

              {/* Descripción */}
              <div>
                <label className="text-textDim text-xs mb-1 block">Descripción</label>
                <input
                  type="text"
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                  required
                  placeholder="¿En qué?"
                  className="w-full bg-bg border border-canto rounded-xl px-4 py-3 text-text focus:outline-none focus:border-accent"
                />
              </div>

              {/* Categoría + Cuenta/TC */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-textDim text-xs mb-1 block">Categoría</label>
                  <select
                    value={categoria}
                    onChange={e => setCategoria(e.target.value)}
                    className="w-full bg-bg border border-canto rounded-xl px-3 py-3 text-text focus:outline-none focus:border-accent"
                  >
                    {cats.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  {tipo === 'gasto_tc' ? (
                    <>
                      <label className="text-textDim text-xs mb-1 block">Tarjeta</label>
                      <select
                        value={tcId}
                        onChange={e => setTcId(e.target.value)}
                        className="w-full bg-bg border border-canto rounded-xl px-3 py-3 text-text focus:outline-none focus:border-accent"
                      >
                        {resumenTCs.length === 0
                          ? <option value="">Sin tarjetas</option>
                          : resumenTCs.map(({ tc, resumen }) => (
                            <option key={tc.id} value={tc.id}>
                              {tc.nombre} — {formatQ(resumen.disponible)}
                            </option>
                          ))
                        }
                      </select>
                    </>
                  ) : (
                    <>
                      <label className="text-textDim text-xs mb-1 block">Cuenta</label>
                      <select
                        value={cuentaId}
                        onChange={e => setCuentaId(e.target.value)}
                        className="w-full bg-bg border border-canto rounded-xl px-3 py-3 text-text focus:outline-none focus:border-accent"
                      >
                        {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </>
                  )}
                </div>
              </div>
              {tipo === 'gasto_tc' && tcId && (() => {
                const sel = resumenTCs.find(r => r.tc.id === tcId)
                const monto = parseFloat(cantidad)
                if (!sel || isNaN(monto) || monto <= 0) return null
                const tras = sel.tc.limite_credito - sel.tc.deuda_actual - toCentavos(monto)
                return (
                  <p className={`text-xs font-mono ${tras >= 0 ? 'text-success' : 'text-danger'}`}>
                    Disponible tras cargo: {formatQ(Math.max(0, tras))}
                    {tras < 0 ? ' ⚠ excede disponible' : ''}
                  </p>
                )
              })()}

              {/* Fecha */}
              <div>
                <label className="text-textDim text-xs mb-1 block">Fecha</label>
                <input
                  type="date"
                  value={fecha}
                  onChange={e => setFecha(e.target.value)}
                  className="w-full bg-bg border border-canto rounded-xl px-4 py-3 text-text focus:outline-none focus:border-accent"
                />
              </div>

              {formError && (
                <p role="alert" className="text-danger text-sm bg-danger/10 rounded-xl px-4 py-2">{formError}</p>
              )}

              <button
                type="submit"
                disabled={saving}
                className={`w-full font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 ${
                  tipo === 'ingreso'  ? 'bg-accent text-bg'
                  : tipo === 'gasto_tc' ? 'bg-warning/20 text-warning border border-warning/40'
                  : 'bg-danger text-text'
                }`}
              >
                {saving ? 'Guardando...' : tipo === 'gasto_tc' ? 'Registrar cargo' : 'Guardar'}
              </button>
            </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
