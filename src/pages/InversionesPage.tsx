// src/pages/InversionesPage.tsx
import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RechartTooltip,
  ResponsiveContainer,
} from 'recharts'
import { useInversiones, type Inversion } from '../hooks/useInversiones'
import {
  formatQ, toCentavos, usdToGTQ, calcRendimientoAnualizado,
} from '../lib/finanzas'
import { TIPOS_INVERSION, hoyGT } from '../lib/constants'

interface Props { userId: string }

type Pantalla = 'lista' | 'nueva' | 'actualizar_valor' | 'tipo_cambio'

const INFLACION_GT = 4   // % anual de referencia para Guatemala

export default function InversionesPage({ userId }: Props) {
  const {
    inversiones, resumen, evolucionPortafolio,
    tipoCambioUSD, tipoCambioFecha, tieneUSD,
    loading, error,
    agregarInversion, actualizarValor, archivarInversion, actualizarTipoCambio,
  } = useInversiones(userId)

  // ── Navegación ──────────────────────────────────────────
  const [pantalla, setPantalla] = useState<Pantalla>('lista')
  const [selId, setSelId]       = useState<string | null>(null)
  const selInv = inversiones.find(i => i.id === selId) ?? null

  // ── Form: nueva inversión ────────────────────────────────
  const [nombre, setNombre]           = useState('')
  const [plataforma, setPlataforma]   = useState('')
  const [tipo, setTipo]               = useState<string>(TIPOS_INVERSION[0].value)
  const [capital, setCapital]         = useState('')
  const [moneda, setMoneda]           = useState<'GTQ' | 'USD'>('GTQ')
  const [fechaInicio, setFechaInicio] = useState(hoyGT())
  const [notas, setNotas]             = useState('')

  // ── Form: actualizar valor ───────────────────────────────
  const [nuevoValor, setNuevoValor]   = useState('')
  const [fechaUpdate, setFechaUpdate] = useState(hoyGT())

  // ── Form: tipo de cambio ─────────────────────────────────
  const [nuevoCambio, setNuevoCambio] = useState('')

  // ── Estado general ───────────────────────────────────────
  const [saving, setSaving]   = useState(false)
  const [errForm, setErrForm] = useState<string | null>(null)

  // Tipo de cambio desactualizado si tiene 7+ días sin actualizar
  const tipoCambioDesactualizado = (() => {
    if (!tipoCambioFecha) return false
    const dias = Math.floor((Date.now() - new Date(tipoCambioFecha).getTime()) / (1000 * 60 * 60 * 24))
    return dias >= 7
  })()

  // ── Helpers de conversión ────────────────────────────────
  const valorEnGTQ   = (inv: Inversion) =>
    inv.moneda === 'USD' ? usdToGTQ(inv.valor_actual,    tipoCambioUSD) : inv.valor_actual
  const capitalEnGTQ = (inv: Inversion) =>
    inv.moneda === 'USD' ? usdToGTQ(inv.monto_invertido, tipoCambioUSD) : inv.monto_invertido

  // ── Helpers de apertura de pantallas ────────────────────
  const abrirActualizar = (id: string) => {
    const inv = inversiones.find(i => i.id === id)
    if (!inv) return
    setNuevoValor(String((inv.valor_actual / 100).toFixed(2)))
    setFechaUpdate(hoyGT())
    setErrForm(null)
    setSelId(id)
    setPantalla('actualizar_valor')
  }

  const abrirNueva = () => {
    setNombre(''); setPlataforma(''); setTipo(TIPOS_INVERSION[0].value)
    setCapital(''); setMoneda('GTQ'); setFechaInicio(hoyGT()); setNotas('')
    setErrForm(null)
    setPantalla('nueva')
  }

  // ── Handlers ────────────────────────────────────────────
  const handleNueva = async () => {
    setErrForm(null)
    const cap = parseFloat(capital)
    if (!nombre.trim())         return setErrForm('El nombre es requerido')
    if (isNaN(cap) || cap <= 0) return setErrForm('El capital debe ser mayor a 0')
    try {
      setSaving(true)
      await agregarInversion({
        nombre:          nombre.trim(),
        plataforma:      plataforma.trim() || undefined,
        tipo,
        monto_invertido: toCentavos(cap),
        moneda,
        fecha_inicio:    fechaInicio,
        notas:           notas.trim() || undefined,
      })
      setPantalla('lista')
    } catch (e: unknown) {
      setErrForm(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleActualizar = async () => {
    if (!selId) return
    setErrForm(null)
    const val = parseFloat(nuevoValor)
    if (isNaN(val) || val < 0) return setErrForm('El valor debe ser 0 o mayor')
    try {
      setSaving(true)
      await actualizarValor(selId, toCentavos(val), fechaUpdate)
      setPantalla('lista')
    } catch (e: unknown) {
      setErrForm(e instanceof Error ? e.message : 'Error al actualizar')
    } finally {
      setSaving(false)
    }
  }

  const handleArchivar = async () => {
    if (!selId || !selInv) return
    if (!confirm(`¿Archivar "${selInv.nombre}"? No se eliminará el historial.`)) return
    try {
      setSaving(true)
      await archivarInversion(selId)
      setPantalla('lista')
    } catch (e: unknown) {
      setErrForm(e instanceof Error ? e.message : 'Error al archivar')
    } finally {
      setSaving(false)
    }
  }

  const handleTipoCambio = async () => {
    setErrForm(null)
    const cambio = parseFloat(nuevoCambio)
    if (isNaN(cambio) || cambio <= 0) return setErrForm('Ingresa un tipo de cambio válido (ej: 7.75)')
    try {
      setSaving(true)
      await actualizarTipoCambio(toCentavos(cambio))   // Q7.75 → 775 centavos
      setPantalla('lista')
    } catch (e: unknown) {
      setErrForm(e instanceof Error ? e.message : 'Error al actualizar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-muted text-sm">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white font-display font-bold text-xl">Inversiones</h1>
          {resumen.ganancia_total !== 0 && (
            <p className={`text-xs mt-0.5 font-mono ${resumen.ganancia_total >= 0 ? 'text-success' : 'text-danger'}`}>
              {resumen.ganancia_total >= 0 ? '+' : ''}{formatQ(resumen.ganancia_total)} total
            </p>
          )}
        </div>
        <div className="flex gap-2 items-center">
          {tieneUSD && (
            <button
              onClick={() => {
                setNuevoCambio(String((tipoCambioUSD / 100).toFixed(2)))
                setErrForm(null)
                setPantalla('tipo_cambio')
              }}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                tipoCambioDesactualizado
                  ? 'bg-warning/10 text-warning border border-warning/30'
                  : 'bg-surface2 text-muted hover:text-white'
              }`}
            >
              {tipoCambioDesactualizado ? '⚠ ' : ''}Q{(tipoCambioUSD / 100).toFixed(2)}/USD
            </button>
          )}
          <button
            onClick={abrirNueva}
            className="bg-accent text-bg px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            + Nueva
          </button>
        </div>
      </div>

      {error && (
        <p className="text-danger text-sm bg-danger/10 rounded-xl p-3 mb-4">{error}</p>
      )}

      {/* ── Resumen portafolio ──────────────────────────── */}
      {resumen.capital_total > 0 && (
        <div className="bg-surface rounded-2xl p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted text-xs mb-0.5">Capital invertido</p>
              <p className="text-white font-mono">{formatQ(resumen.capital_total)}</p>
            </div>
            <div>
              <p className="text-muted text-xs mb-0.5">Valor actual</p>
              <p className="text-white font-mono font-bold">{formatQ(resumen.valor_total)}</p>
            </div>
            <div>
              <p className="text-muted text-xs mb-0.5">Ganancia total</p>
              <p className={`font-mono font-semibold ${resumen.ganancia_total >= 0 ? 'text-success' : 'text-danger'}`}>
                {resumen.ganancia_total >= 0 ? '+' : ''}{formatQ(resumen.ganancia_total)}
                <span className="text-xs ml-1">
                  ({resumen.ganancia_pct >= 0 ? '+' : ''}{resumen.ganancia_pct.toFixed(1)}%)
                </span>
              </p>
            </div>
            <div>
              <p className="text-muted text-xs mb-0.5">Rendimiento anual</p>
              <p className={`font-mono font-semibold ${resumen.rendimiento_anualizado >= INFLACION_GT ? 'text-success' : 'text-warning'}`}>
                {resumen.rendimiento_anualizado >= 0 ? '+' : ''}
                {resumen.rendimiento_anualizado.toFixed(1)}% / año
              </p>
            </div>
          </div>

          {/* Gráfica de evolución — solo si hay 2+ puntos */}
          {evolucionPortafolio.length > 1 && (
            <div className="-mx-1">
              <p className="text-muted text-xs mb-1.5 px-1">Evolución del portafolio</p>
              <ResponsiveContainer width="100%" height={90}>
                <LineChart data={evolucionPortafolio}>
                  <XAxis dataKey="fecha" hide />
                  <YAxis hide domain={['auto', 'auto']} />
                  <RechartTooltip
                    formatter={(v: unknown) => [formatQ(v as number), 'Valor']}
                    labelFormatter={(l: unknown) => l as string}
                    contentStyle={{
                      background: '#12151c', border: 'none',
                      borderRadius: 8, fontSize: 12,
                    }}
                    labelStyle={{ color: '#8b90a0' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="valor_total"
                    stroke="#7c6af7"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#7c6af7' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────── */}
      {inversiones.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📈</p>
          <p className="text-muted text-sm">No tienes inversiones registradas</p>
          <p className="text-textDim text-xs mt-1">Agrega tu primera inversión para empezar</p>
        </div>
      )}

      {/* ── Lista de inversiones ─────────────────────────── */}
      <div className="flex flex-col gap-3">
        {inversiones.map(inv => {
          const rend           = inv.monto_invertido > 0
            ? calcRendimientoAnualizado(inv.monto_invertido, inv.valor_actual, inv.fecha_inicio)
            : 0
          const gananciaNativa = inv.valor_actual - inv.monto_invertido
          const gananciaGTQ    = valorEnGTQ(inv) - capitalEnGTQ(inv)
          const superaInflacion = rend > INFLACION_GT

          return (
            <div key={inv.id} className="bg-surface rounded-2xl p-4 space-y-2.5">
              {/* Cabecera */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-white font-semibold text-sm">{inv.nombre}</p>
                  {inv.plataforma && <p className="text-muted text-xs">{inv.plataforma}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted bg-surface2 px-2 py-0.5 rounded-full">{inv.tipo}</span>
                  {inv.moneda === 'USD' && (
                    <span className="text-xs text-warning bg-warning/10 px-2 py-0.5 rounded-full">USD</span>
                  )}
                </div>
              </div>

              {/* Métricas */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted">Capital</p>
                  <p className="text-white font-mono">
                    {inv.moneda === 'USD'
                      ? `$${(inv.monto_invertido / 100).toFixed(2)}`
                      : formatQ(inv.monto_invertido)}
                  </p>
                  {inv.moneda === 'USD' && (
                    <p className="text-textDim">≈ {formatQ(capitalEnGTQ(inv))}</p>
                  )}
                </div>
                <div>
                  <p className="text-muted">Valor actual</p>
                  <p className="text-white font-mono font-bold">
                    {inv.moneda === 'USD'
                      ? `$${(inv.valor_actual / 100).toFixed(2)}`
                      : formatQ(inv.valor_actual)}
                  </p>
                  {inv.moneda === 'USD' && (
                    <p className="text-textDim">≈ {formatQ(valorEnGTQ(inv))}</p>
                  )}
                </div>
                <div>
                  <p className="text-muted">Ganancia</p>
                  <p className={`font-mono font-semibold ${gananciaNativa >= 0 ? 'text-success' : 'text-danger'}`}>
                    {gananciaNativa >= 0 ? '+' : ''}
                    {inv.moneda === 'USD'
                      ? `$${(gananciaNativa / 100).toFixed(2)}`
                      : formatQ(gananciaNativa)}
                  </p>
                  {inv.moneda === 'USD' && (
                    <p className={`text-xs ${gananciaGTQ >= 0 ? 'text-success/70' : 'text-danger/70'}`}>
                      ≈ {gananciaGTQ >= 0 ? '+' : ''}{formatQ(gananciaGTQ)}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-muted">Anualizado</p>
                  <p className={`font-mono font-semibold ${rend >= INFLACION_GT ? 'text-success' : 'text-warning'}`}>
                    {rend >= 0 ? '+' : ''}{rend.toFixed(1)}% / año
                  </p>
                </div>
              </div>

              {/* Indicador inflación + botón */}
              <div className="flex items-center justify-between pt-0.5">
                <p className={`text-xs ${superaInflacion ? 'text-success' : 'text-warning'}`}>
                  {superaInflacion ? '✅ Supera inflación GT (~4%)' : '⚠️ Por debajo de inflación'}
                </p>
                <button
                  onClick={() => abrirActualizar(inv.id)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                >
                  Actualizar valor
                </button>
              </div>

              {inv.fecha_ultimo_update && (
                <p className="text-textDim text-xs">Actualizado: {inv.fecha_ultimo_update}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* ═══════════════ MODALES ═══════════════ */}

      {/* Modal: Nueva inversión */}
      {pantalla === 'nueva' && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-50">
          <div className="bg-surface w-full rounded-t-2xl p-5 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-white font-semibold">Nueva inversión</h2>
              <button onClick={() => setPantalla('lista')} className="text-muted hover:text-white text-lg">✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <input
                placeholder="Nombre (ej: Fondo HAPI)"
                value={nombre} onChange={e => setNombre(e.target.value)}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <input
                placeholder="Plataforma (opcional, ej: HAPI, SAT, Binance)"
                value={plataforma} onChange={e => setPlataforma(e.target.value)}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <select
                value={tipo} onChange={e => setTipo(e.target.value)}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent"
              >
                {TIPOS_INVERSION.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  placeholder={`Capital inicial (${moneda === 'USD' ? 'USD $' : 'GTQ Q'})`}
                  value={capital} onChange={e => setCapital(e.target.value)}
                  inputMode="decimal"
                  className="flex-1 bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
                />
                <div className="flex bg-bg border border-muted/30 rounded-xl overflow-hidden">
                  {(['GTQ', 'USD'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setMoneda(m)}
                      className={`px-3 py-3 text-sm font-medium transition-colors ${
                        moneda === m ? 'bg-accent text-bg font-semibold' : 'text-muted hover:text-white'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-muted text-xs mb-1">Fecha de inicio</p>
                <input
                  type="date"
                  value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
                  className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent"
                />
              </div>
              <textarea
                placeholder="Notas (opcional)"
                value={notas} onChange={e => setNotas(e.target.value)}
                rows={2}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent resize-none"
              />
              {errForm && <p className="text-danger text-sm">{errForm}</p>}
              <button
                onClick={handleNueva}
                disabled={saving}
                className="w-full py-3 rounded-xl bg-accent text-bg font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity mt-1"
              >
                {saving ? 'Guardando...' : 'Agregar inversión'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Actualizar valor */}
      {pantalla === 'actualizar_valor' && selInv && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-50">
          <div className="bg-surface w-full rounded-t-2xl p-5">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-white font-semibold">Actualizar — {selInv.nombre}</h2>
              <button onClick={() => setPantalla('lista')} className="text-muted hover:text-white text-lg">✕</button>
            </div>
            <div className="bg-bg rounded-xl p-3 mb-4">
              <p className="text-muted text-xs">Valor anterior</p>
              <p className="text-white font-mono">
                {selInv.moneda === 'USD'
                  ? `$${(selInv.valor_actual / 100).toFixed(2)}`
                  : formatQ(selInv.valor_actual)}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <input
                placeholder={`Nuevo valor (${selInv.moneda === 'USD' ? '$' : 'Q'})`}
                value={nuevoValor} onChange={e => setNuevoValor(e.target.value)}
                inputMode="decimal"
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <div>
                <p className="text-muted text-xs mb-1">Fecha del update</p>
                <input
                  type="date"
                  value={fechaUpdate} onChange={e => setFechaUpdate(e.target.value)}
                  className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent"
                />
              </div>
              {errForm && <p className="text-danger text-sm">{errForm}</p>}
              <button
                onClick={handleActualizar}
                disabled={saving}
                className="w-full py-3 rounded-xl bg-accent text-bg font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? 'Guardando...' : 'Guardar nuevo valor'}
              </button>
              <button
                onClick={handleArchivar}
                disabled={saving}
                className="w-full py-2 rounded-xl text-danger/70 text-xs hover:text-danger transition-colors"
              >
                Archivar inversión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Tipo de cambio USD */}
      {pantalla === 'tipo_cambio' && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-50">
          <div className="bg-surface w-full rounded-t-2xl p-5">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-white font-semibold">Tipo de cambio USD</h2>
              <button onClick={() => setPantalla('lista')} className="text-muted hover:text-white text-lg">✕</button>
            </div>
            <div className="bg-bg rounded-xl p-3 mb-4">
              <p className="text-muted text-xs">Tipo de cambio actual</p>
              <p className="text-white font-mono">Q{(tipoCambioUSD / 100).toFixed(2)} por USD</p>
              {tipoCambioFecha && (
                <p className={`text-xs mt-0.5 ${tipoCambioDesactualizado ? 'text-warning' : 'text-textDim'}`}>
                  {tipoCambioDesactualizado
                    ? '⚠️ Sin actualizar hace más de 7 días'
                    : `Actualizado: ${new Date(tipoCambioFecha).toLocaleDateString('es-GT')}`}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <input
                placeholder="Nuevo tipo de cambio (ej: 7.75)"
                value={nuevoCambio} onChange={e => setNuevoCambio(e.target.value)}
                inputMode="decimal"
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              {errForm && <p className="text-danger text-sm">{errForm}</p>}
              <button
                onClick={handleTipoCambio}
                disabled={saving}
                className="w-full py-3 rounded-xl bg-accent text-bg font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? 'Guardando...' : 'Actualizar tipo de cambio'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
