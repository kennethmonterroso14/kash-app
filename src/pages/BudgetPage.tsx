import { useEffect, useState, useMemo, useRef } from 'react'
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
  const { txns, loading: txnsLoading } = useTransacciones(userId, mes)
  // Los presupuestos se guardan etiquetados con su mes: así una respuesta que
  // llega tarde (el usuario ya cambió de mes) no puede renderizarse ni editarse.
  const [estado, setEstado] = useState<{ mes: string; rows: Presupuesto[] }>({ mes: '', rows: [] })
  const [fetchError, setFetchError] = useState<string | null>(null)

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

  // Latch de la copia automática, por mes. Es un ref (no dependencia del efecto):
  // escribirlo no re-renderiza, así que el efecto no se cancela a sí mismo y la
  // copia alcanza a mostrar el banner con "Deshacer".
  const copiaIntentadaRef = useRef<string | null>(null)
  const [vacioAlCargar, setVacioAlCargar] = useState<{ mes: string; vacio: boolean }>({ mes: '', vacio: false })
  // Banner, error y fila expandida van etiquetados con su mes: así cambiar de mes
  // los descarta por derivación, sin un efecto que reinicie estado.
  const [bannerCopia, setBannerCopia] = useState<{ mes: string; n: number; ids: string[] } | null>(null)
  const [copiaError, setCopiaError] = useState<{ mes: string; msg: string } | null>(null)
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [expandido, setExpandido] = useState<{ mes: string; id: string } | null>(null)

  const [anio, mesNum] = mes.split('-').map(Number)
  const mesLabel = `${MESES[mesNum - 1]} ${anio}`
  const mesInicio = `${mes}-01`

  // loading derivado: mientras el mes pedido y el mes cargado no coincidan.
  // Evita el frame en que se ven las tarjetas del mes anterior bajo el mes nuevo.
  const loading = estado.mes !== mesInicio
  const presupuestos = useMemo(
    () => (estado.mes === mesInicio ? estado.rows : []),
    [estado, mesInicio],
  )
  const expandedId = expandido?.mes === mesInicio ? expandido.id : null
  const bannerVisible = bannerCopia?.mes === mesInicio ? bannerCopia : null
  const errorVisible = copiaError?.mes === mesInicio ? copiaError.msg : null

  useEffect(() => {
    let ignore = false
    supabase
      .from('presupuestos')
      .select('id, categoria, monto_limite, mes')
      .eq('user_id', userId)
      .eq('mes', mesInicio)
      .eq('activo', true)
      .then(({ data, error }) => {
        if (ignore) return
        if (error) {
          // Un fallo de red no debe verse como "sin presupuestos": eso además
          // armaba la copia automática sobre un mes que sí tenía datos.
          setFetchError(error.message)
          return
        }
        const rows = data ?? []
        setFetchError(null)
        setEstado({ mes: mesInicio, rows })
        setVacioAlCargar({ mes: mesInicio, vacio: rows.length === 0 })
      })
    return () => { ignore = true }
  }, [userId, mesInicio])

  // Clear banner timer on unmount
  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
    }
  }, [])

  // Copia automática de los presupuestos del mes anterior cuando el mes está vacío.
  // Se decide con el resultado del fetch (vacioAlCargar), NO con presupuestos.length:
  // con la longitud viva, borrar la última tarjeta volvía a disparar la copia y
  // resucitaba justo lo que el usuario acababa de eliminar.
  useEffect(() => {
    if (vacioAlCargar.mes !== mesInicio || !vacioAlCargar.vacio) return
    if (copiaIntentadaRef.current === mesInicio) return
    // Solo mes anterior -> mes actual. Sin esto, avanzar con "→" materializaba
    // presupuestos en cada mes futuro visitado (fuera de alcance por diseño).
    if (mes > mesActual()) return

    copiaIntentadaRef.current = mesInicio

    const prevDate = new Date(anio, mesNum - 2, 1)
    const mesPrevInicio = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-01`

    ;(async () => {
      const { data: prevRows, error: prevError } = await supabase
        .from('presupuestos')
        .select('categoria, monto_limite')
        .eq('user_id', userId)
        .eq('mes', mesPrevInicio)
        .eq('activo', true)

      if (prevError) { setCopiaError({ mes: mesInicio, msg: prevError.message }); return }
      if (!prevRows || prevRows.length === 0) return

      const inserts = prevRows.map(r => ({
        user_id: userId,
        categoria: r.categoria,
        monto_limite: r.monto_limite,
        mes: mesInicio,
        activo: true,
      }))

      const { data: inserted, error: insertError } = await supabase
        .from('presupuestos')
        .insert(inserts)
        .select('id, categoria, monto_limite, mes')

      if (insertError) { setCopiaError({ mes: mesInicio, msg: insertError.message }); return }
      if (!inserted || inserted.length === 0) return

      setEstado(prev => (prev.mes === mesInicio ? { mes: mesInicio, rows: inserted } : prev))
      setBannerCopia({ mes: mesInicio, n: inserted.length, ids: inserted.map(r => r.id) })
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
      bannerTimerRef.current = setTimeout(() => setBannerCopia(null), 4000)
    })()
  }, [vacioAlCargar, mes, anio, mesNum, userId, mesInicio])

  // Gastos por categoría del mes. Incluye gasto_tc: un gasto con tarjeta es gasto
  // igual, y omitirlo hacía que Presupuestos y Dashboard reportaran cifras distintas.
  // pago_tc queda fuera a propósito: mueve deuda, no es consumo nuevo.
  const gastadoPorCat = useMemo(() => {
    const map: Record<string, number> = {}
    txns.filter(t => t.tipo === 'gasto' || t.tipo === 'gasto_tc').forEach(t => {
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
      setEstado(prev => {
        if (prev.mes !== mesInicio) return prev
        const exists = prev.rows.find(p => p.id === data.id)
        return {
          mes: prev.mes,
          rows: exists ? prev.rows.map(p => p.id === data.id ? data : p) : [...prev.rows, data],
        }
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
    // Acotar por user_id y mes: si por cualquier motivo el id fuera de otro mes,
    // la escritura afecta 0 filas en lugar de reescribir un mes ya cerrado.
    const { data: updated, error } = await supabase
      .from('presupuestos')
      .update({ monto_limite: centavos })
      .eq('id', editingId)
      .eq('user_id', userId)
      .eq('mes', mesInicio)
      .select('id')

    if (error) {
      setEditError(error.message)
      setEditSaving(false)
      return
    }
    if (!updated || updated.length === 0) {
      setEditError('El presupuesto ya no existe en este mes')
      setEditSaving(false)
      return
    }

    setEstado(prev => (
      prev.mes === mesInicio
        ? { mes: prev.mes, rows: prev.rows.map(p => p.id === editingId ? { ...p, monto_limite: centavos } : p) }
        : prev
    ))
    setEditingId(null)
    setEditSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (pendingDelete === id) {
      setPendingDelete(null)
      const { error } = await supabase
        .from('presupuestos')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
        .eq('mes', mesInicio)
      if (error) { setCopiaError({ mes: mesInicio, msg: error.message }); return }
      setEstado(prev => (
        prev.mes === mesInicio
          ? { mes: prev.mes, rows: prev.rows.filter(p => p.id !== id) }
          : prev
      ))
    } else {
      setPendingDelete(id)
      setTimeout(() => setPendingDelete(p => p === id ? null : p), 3000)
    }
  }

  const handleUndo = async () => {
    if (!bannerVisible) return
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current)
      bannerTimerRef.current = null
    }
    const { error } = await supabase
      .from('presupuestos')
      .delete()
      .in('id', bannerVisible.ids)
      .eq('user_id', userId)
    if (error) {
      setCopiaError({ mes: mesInicio, msg: error.message })
      return
    }
    setEstado(prev => (prev.mes === mesInicio ? { mes: prev.mes, rows: [] } : prev))
    setBannerCopia(null)
    // El latch queda puesto para este mes: deshacer no debe re-disparar la copia.
    // Navegar a otro mes y volver lo reinicia en el efecto de cambio de mes.
    copiaIntentadaRef.current = mesInicio
  }

  if (fetchError) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="bg-surface rounded-2xl p-6 text-center space-y-3">
          <p className="text-white font-semibold">No se pudieron cargar tus presupuestos</p>
          <p className="text-muted text-sm">{fetchError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full bg-accent text-bg font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (loading || txnsLoading) {
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

      {/* Carry-over banner */}
      {bannerVisible && (
        <div className="flex justify-between items-center bg-accent text-bg rounded-xl px-4 py-2.5">
          <span className="text-sm font-medium">
            Se copiaron {bannerVisible.n} presupuestos del mes anterior
          </span>
          <button
            type="button"
            onClick={handleUndo}
            className="text-xs font-semibold bg-bg/20 rounded-lg px-3 py-1 ml-3 hover:bg-bg/30 transition-colors"
          >
            ↩ Deshacer
          </button>
        </div>
      )}

      {errorVisible && (
        <p role="alert" className="text-danger text-sm bg-danger/10 rounded-xl px-4 py-2">
          {errorVisible}
        </p>
      )}

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

        // La tarjeta es un div normal. Con role="button" el navegador poda sus
        // descendientes del árbol de accesibilidad (children presentational), así que
        // el %, lo gastado, el límite y la lista de transacciones quedaban inaudibles.
        // Solo el encabezado izquierdo es el botón que expande.
        return (
          <div key={p.id} className="bg-surface rounded-2xl p-4">
            <div className="flex justify-between items-center mb-2">
              <button
                type="button"
                onClick={() => setExpandido(prev => (prev?.mes === mesInicio && prev.id === p.id ? null : { mes: mesInicio, id: p.id }))}
                aria-expanded={expandedId === p.id}
                aria-controls={`txns-${p.id}`}
                className="flex items-center gap-2 rounded-lg -m-1 p-1 hover:opacity-80 transition-opacity"
              >
                <span className="text-white text-sm font-medium">{p.categoria}</span>
                <span aria-hidden="true" className={`text-xs ${expandedId === p.id ? 'text-accent' : 'text-muted'}`}>
                  {expandedId === p.id ? '▴' : '▾'}
                </span>
              </button>
              <div className="flex items-center gap-1">
                <span
                  aria-label={`${pct}% del límite usado`}
                  className={`text-xs font-mono font-semibold ${
                    estado === 'excedido' ? 'text-danger' : estado === 'alerta' ? 'text-yellow-400' : 'text-success'
                  }`}
                >
                  {pct}%
                </span>
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="text-xs px-2 py-1 rounded-lg text-muted hover:text-accent transition-colors"
                  aria-label={`Editar límite de ${p.categoria}`}
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(p.id)}
                  aria-label={pendingDelete === p.id
                    ? 'Confirmar eliminación'
                    : `Eliminar presupuesto de ${p.categoria}`}
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
            <div aria-hidden="true" className="h-2 bg-bg rounded-full overflow-hidden mb-2">
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
            {expandedId === p.id && (() => {
              // Mismo criterio que gastadoPorCat: incluir gasto_tc para que el
              // detalle sume exactamente lo que muestra la barra.
              const txsCat = txns
                .filter(t => (t.tipo === 'gasto' || t.tipo === 'gasto_tc') && t.categoria === p.categoria)
                .sort((a, b) => b.fecha.localeCompare(a.fecha))
              return (
                <div id={`txns-${p.id}`} className="border-t border-muted/20 mt-3 pt-3">
                  <p className="text-muted text-xs uppercase tracking-wider mb-2">
                    {txsCat.length} transacciones
                  </p>
                  {txsCat.length === 0 ? (
                    <p className="text-muted text-xs text-center py-2">
                      Sin gastos registrados en este mes
                    </p>
                  ) : (
                    <div>
                      {txsCat.map(t => (
                        <div
                          key={t.id}
                          className="flex justify-between items-start py-2 border-b border-muted/10 last:border-0"
                        >
                          <div>
                            <p className="text-white text-xs">{t.descripcion}</p>
                            <p className="text-muted text-xs">{t.fecha}</p>
                          </div>
                          <span className="text-danger text-xs font-mono font-semibold ml-4 flex-shrink-0">
                            −{formatQ(Math.abs(t.cantidad))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
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
