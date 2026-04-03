import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { formatQ, toCentavos, calcTiempoParaMeta } from '../lib/finanzas'

interface Props { userId: string }

interface Meta {
  id: string
  nombre: string
  monto_objetivo: number
  monto_actual: number
  completada: boolean
  created_at: string
}

const DEFAULT_AHORRO_MENSUAL_Q = 2000

export default function MetasPage({ userId }: Props) {
  const [metas, setMetas] = useState<Meta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Ahorro mensual compartido (en quetzales, para input)
  const [ahorroMensualQ, setAhorroMensualQ] = useState(String(DEFAULT_AHORRO_MENSUAL_Q))

  // Modal nueva meta
  const [showForm, setShowForm] = useState(false)
  const [nombre, setNombre] = useState('')
  const [montoObjetivoQ, setMontoObjetivoQ] = useState('')
  const [montoActualQ, setMontoActualQ] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // In-flight guard for Completar / Eliminar
  const [operating, setOperating] = useState(false)

  // Eliminación en 2 pasos
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  // ── Carga inicial ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    const fetchMetas = async () => {
      setLoading(true)
      setError(null)
      const { data, error: err } = await supabase
        .from('metas_ahorro')
        .select('id, nombre, monto_objetivo, monto_actual, completada, created_at')
        .eq('user_id', userId)
        .eq('completada', false)
        .order('created_at', { ascending: true })

      if (cancelled) return
      if (err) {
        setError(err.message)
      } else {
        setMetas((data as Meta[]) ?? [])
      }
      setLoading(false)
    }

    fetchMetas()
    return () => { cancelled = true }
  }, [userId])

  // ── Completar meta ───────────────────────────────────────────
  const handleCompletar = async (id: string) => {
    setOperating(true)
    try {
      const { error: err } = await supabase
        .from('metas_ahorro')
        .update({ completada: true })
        .eq('id', id)
        .eq('user_id', userId)

      if (err) {
        setError(err.message)
        return
      }
      setMetas(prev => prev.filter(m => m.id !== id))
    } finally {
      setOperating(false)
    }
  }

  // ── Eliminar meta (2 pasos) ──────────────────────────────────
  const handleEliminar = async (id: string) => {
    if (pendingDelete !== id) {
      setPendingDelete(id)
      setTimeout(() => setPendingDelete(p => (p === id ? null : p)), 3000)
      return
    }

    // Segundo tap: confirmar
    setPendingDelete(null)
    setOperating(true)
    try {
      const { error: err } = await supabase
        .from('metas_ahorro')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)

      if (err) {
        setError(err.message)
        return
      }
      setMetas(prev => prev.filter(m => m.id !== id))
    } finally {
      setOperating(false)
    }
  }

  // ── Nueva meta ───────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    const objetivo = parseFloat(montoObjetivoQ)
    const actual = parseFloat(montoActualQ || '0')
    const objetivoCentavos = toCentavos(objetivo)
    const actualCentavos = toCentavos(actual)

    if (!nombre.trim()) { setFormError('El nombre es requerido.'); return }
    if (isNaN(objetivo) || objetivo <= 0) { setFormError('El monto objetivo debe ser mayor a 0.'); return }
    if (isNaN(actual) || actual < 0) { setFormError('El monto ya tengo no puede ser negativo.'); return }
    if (actualCentavos > objetivoCentavos) {
      setFormError('El monto "Ya tengo" no puede superar el objetivo')
      return
    }

    setSaving(true)
    const { data, error: err } = await supabase
      .from('metas_ahorro')
      .insert({
        user_id: userId,
        nombre: nombre.trim(),
        monto_objetivo: objetivoCentavos,
        monto_actual: actualCentavos,
      })
      .select('id, nombre, monto_objetivo, monto_actual, completada, created_at')
      .single()

    setSaving(false)

    if (err) {
      setFormError(err.message)
      return
    }

    if (data) setMetas(prev => [...prev, data as Meta])
    setNombre('')
    setMontoObjetivoQ('')
    setMontoActualQ('')
    setShowForm(false)
  }

  // ── Helpers ──────────────────────────────────────────────────
  const ahorroMensualCentavos = toCentavos(parseFloat(ahorroMensualQ) || 0)

  const calcEstimado = (meta: Meta): string => {
    if (ahorroMensualCentavos <= 0) return 'Ingresa un ahorro mensual'
    try {
      const { meses, fecha } = calcTiempoParaMeta(
        meta.monto_objetivo,
        ahorroMensualCentavos,
        meta.monto_actual
      )
      if (meses === 0) return 'Meta alcanzada'
      const fechaStr = fecha.toLocaleDateString('es-GT', { month: 'short', year: 'numeric' })
      return `~${meses} ${meses === 1 ? 'mes' : 'meses'} · Meta: ${fechaStr}`
    } catch {
      return 'Ingresa un ahorro mensual válido'
    }
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-white font-semibold text-lg">Metas de ahorro</h1>
        <button
          onClick={() => setShowForm(true)}
          className="bg-accent text-bg font-semibold text-sm px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
        >
          + Nueva meta
        </button>
      </div>

      {/* Ahorro mensual compartido */}
      <div className="bg-surface rounded-2xl px-4 py-4 mb-5">
        <label className="text-muted text-xs mb-1 block">Ahorro mensual estimado (Q)</label>
        <input
          type="number"
          min="1"
          step="100"
          value={ahorroMensualQ}
          onChange={e => setAhorroMensualQ(e.target.value)}
          className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-xl font-mono focus:outline-none focus:border-accent"
        />
      </div>

      {/* Error global */}
      {error && (
        <p className="text-danger text-sm mb-4">{error}</p>
      )}

      {/* Loading */}
      {loading && (
        <p className="text-muted text-center py-8">Cargando metas...</p>
      )}

      {/* Empty state */}
      {!loading && metas.length === 0 && (
        <div className="bg-surface rounded-2xl p-8 text-center space-y-4">
          <p className="text-muted">No tienes metas de ahorro activas.</p>
          <button
            onClick={() => setShowForm(true)}
            className="bg-accent text-bg font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity"
          >
            + Nueva meta
          </button>
        </div>
      )}

      {/* Lista de metas */}
      <div className="space-y-3">
        {metas.map(meta => {
          const pct = meta.monto_objetivo > 0
            ? Math.min(100, Math.round((meta.monto_actual / meta.monto_objetivo) * 100))
            : 0
          const estimado = calcEstimado(meta)

          return (
            <div key={meta.id} className="bg-surface rounded-2xl px-4 py-4 space-y-3">
              {/* Nombre */}
              <div className="flex items-start justify-between gap-2">
                <p className="text-white font-medium">{meta.nombre}</p>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleCompletar(meta.id)}
                    disabled={operating}
                    className="text-xs px-2 py-1 rounded-lg text-accent border border-accent/40 hover:bg-accent hover:text-bg transition-colors disabled:opacity-50"
                  >
                    Completar
                  </button>
                  <button
                    onClick={() => handleEliminar(meta.id)}
                    disabled={operating}
                    className={`text-xs px-2 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                      pendingDelete === meta.id
                        ? 'bg-danger text-white'
                        : 'text-muted hover:text-danger'
                    }`}
                  >
                    {pendingDelete === meta.id ? 'Confirmar' : '×'}
                  </button>
                </div>
              </div>

              {/* Barra de progreso */}
              <div className="w-full bg-bg rounded-full h-2">
                <div
                  className="bg-accent h-2 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* Montos y estimado */}
              <div className="flex items-center justify-between">
                <span className="text-accent font-mono text-sm">
                  {formatQ(meta.monto_actual)}
                  <span className="text-muted"> / {formatQ(meta.monto_objetivo)}</span>
                </span>
                <span className="text-muted text-xs">{pct}%</span>
              </div>

              <p className="text-muted text-xs">{estimado}</p>
            </div>
          )
        })}
      </div>

      {/* Modal nueva meta */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}
        >
          <div className="bg-surface w-full max-w-lg rounded-t-3xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-white font-semibold">Nueva meta</h2>
              <button onClick={() => setShowForm(false)} className="text-muted text-xl">×</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Nombre */}
              <div>
                <label className="text-muted text-xs mb-1 block">Nombre de la meta</label>
                <input
                  type="text"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  required
                  placeholder="Ej: Viaje a Europa"
                  className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent"
                />
              </div>

              {/* Monto objetivo */}
              <div>
                <label className="text-muted text-xs mb-1 block">Monto objetivo (Q)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={montoObjetivoQ}
                  onChange={e => setMontoObjetivoQ(e.target.value)}
                  required
                  placeholder="0.00"
                  className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white font-mono text-xl focus:outline-none focus:border-accent"
                />
              </div>

              {/* Ya tengo */}
              <div>
                <label className="text-muted text-xs mb-1 block">Ya tengo (Q)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={montoActualQ}
                  onChange={e => setMontoActualQ(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white font-mono text-xl focus:outline-none focus:border-accent"
                />
              </div>

              {/* Error del formulario */}
              {formError && (
                <p className="text-danger text-sm">{formError}</p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full bg-accent text-bg font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Crear meta'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
