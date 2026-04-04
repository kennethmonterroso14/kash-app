// src/pages/TarjetasPage.tsx
import { useState, useEffect } from 'react'
import { useTarjetas } from '../hooks/useTarjetas'
import { useCuentas } from '../hooks/useCuentas'
import { formatQ, toCentavos, type TarjetaCredito } from '../lib/finanzas'
import { CATEGORIAS_GASTO, hoyGT } from '../lib/constants'

interface Props { userId: string }

type Pantalla = 'lista' | 'nueva_tc' | 'editar_tc' | 'cargo' | 'pago' | 'cerrar'

const COLORES_TC = [
  '#7c6af7', '#4ade80', '#f87171', '#fbbf24',
  '#60a5fa', '#f472b6', '#34d399', '#fb923c',
]

export default function TarjetasPage({ userId }: Props) {
  const {
    resumenTCs, totalDeuda, loading, error,
    agregarTC, actualizarTC, archivarTC, cerrarCiclo,
    registrarCargo, registrarPago,
  } = useTarjetas(userId)
  const { cuentas } = useCuentas(userId)

  // ── Navegación entre pantallas ─────────────────────────────────
  const [pantalla, setPantalla] = useState<Pantalla>('lista')
  const [tcSelId, setTcSelId]   = useState<string | null>(null)
  const tcSel = resumenTCs.find(r => r.tc.id === tcSelId) ?? null

  // ── Form "Nueva TC" ────────────────────────────────────────────
  const [tcNombre, setTcNombre] = useState('')
  const [tcBanco,  setTcBanco]  = useState('')
  const [tcUlt4,   setTcUlt4]   = useState('')
  const [tcLimite, setTcLimite] = useState('')
  const [tcCierre, setTcCierre] = useState('')
  const [tcPago,   setTcPago]   = useState('')
  const [tcColor,  setTcColor]  = useState(COLORES_TC[0])
  const [savingTC, setSavingTC] = useState(false)
  const [errTC,    setErrTC]    = useState<string | null>(null)

  // ── Form "Nuevo cargo" ─────────────────────────────────────────
  const [cargoMonto,   setCargoMonto]   = useState('')
  const [cargoCat,     setCargoCat]     = useState(CATEGORIAS_GASTO[0])
  const [cargoDesc,    setCargoDesc]    = useState('')
  const [cargoFecha,   setCargoFecha]   = useState(hoyGT())
  const [savingCargo,  setSavingCargo]  = useState(false)
  const [errCargo,     setErrCargo]     = useState<string | null>(null)

  // ── Form "Pagar TC" ────────────────────────────────────────────
  const [pagoMonto,    setPagoMonto]    = useState('')
  const [pagoCuenta,   setPagoCuenta]   = useState('')
  const [pagoFecha,    setPagoFecha]    = useState(hoyGT())
  const [savingPago,   setSavingPago]   = useState(false)
  const [errPago,      setErrPago]      = useState<string | null>(null)

  // ── Cerrar ciclo ───────────────────────────────────────────────
  const [savingCerrar, setSavingCerrar] = useState(false)
  const [errCerrar,    setErrCerrar]    = useState<string | null>(null)

  // Default primera cuenta para pago
  useEffect(() => {
    if (!pagoCuenta && cuentas.length > 0) setPagoCuenta(cuentas[0].id)
  }, [cuentas, pagoCuenta])

  // ── Helpers de reset ───────────────────────────────────────────
  const abrirNuevaTC = () => {
    setTcNombre(''); setTcBanco(''); setTcUlt4('')
    setTcLimite(''); setTcCierre(''); setTcPago('')
    setTcColor(COLORES_TC[0]); setErrTC(null)
    setPantalla('nueva_tc')
  }

  const abrirEditarTC = (tcId: string) => {
    const tc = resumenTCs.find(r => r.tc.id === tcId)?.tc
    if (!tc) return
    setTcNombre(tc.nombre)
    setTcBanco(tc.banco ?? '')
    setTcUlt4(tc.ultimos_4 ?? '')
    setTcLimite(String((tc.limite_credito / 100).toFixed(2)))
    setTcCierre(String(tc.dia_cierre))
    setTcPago(String(tc.dia_pago))
    setTcColor(tc.color)
    setErrTC(null)
    setTcSelId(tcId)
    setPantalla('editar_tc')
  }

  const abrirCargo = (tcId: string) => {
    setCargoMonto(''); setCargoCat(CATEGORIAS_GASTO[0])
    setCargoDesc(''); setCargoFecha(hoyGT()); setErrCargo(null)
    setTcSelId(tcId); setPantalla('cargo')
  }

  const abrirPago = (tcId: string) => {
    const tc = resumenTCs.find(r => r.tc.id === tcId)?.tc
    setPagoMonto(tc ? String((tc.deuda_ciclo_anterior / 100).toFixed(2)) : '')
    setPagoFecha(hoyGT()); setErrPago(null)
    setTcSelId(tcId); setPantalla('pago')
  }

  // ── Handlers ───────────────────────────────────────────────────
  // Valida que el día de pago sea >= 5 días después del cierre.
  // Si pag < cie el pago cae en el mes siguiente (ej: cierre=24, pago=21 → ~27 días) → siempre válido.
  const validarFechasTC = (cie: number, pag: number): string | null => {
    if (pag >= cie && pag < cie + 5) {
      return 'El día de pago debe ser al menos 5 días después del cierre (o en el mes siguiente)'
    }
    return null
  }

  const handleNuevaTC = async () => {
    setErrTC(null)
    const lim = parseFloat(tcLimite)
    const cie = parseInt(tcCierre)
    const pag = parseInt(tcPago)
    if (!tcNombre.trim())                  return setErrTC('El nombre es requerido')
    if (isNaN(lim) || lim <= 0)            return setErrTC('El límite debe ser mayor a Q0')
    if (isNaN(cie) || cie < 1 || cie > 31) return setErrTC('Día de cierre inválido (1-31)')
    if (isNaN(pag) || pag < 1 || pag > 31) return setErrTC('Día de pago inválido (1-31)')
    const errFecha = validarFechasTC(cie, pag)
    if (errFecha) return setErrTC(errFecha)
    try {
      setSavingTC(true)
      await agregarTC({
        nombre:         tcNombre.trim(),
        banco:          tcBanco.trim() || undefined,
        ultimos_4:      tcUlt4.replace(/\D/g, '').slice(0, 4) || undefined,
        limite_credito: toCentavos(lim),
        dia_cierre:     cie,
        dia_pago:       pag,
        color:          tcColor,
      })
      setPantalla('lista')
    } catch (e: unknown) {
      setErrTC(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSavingTC(false)
    }
  }

  const handleEditarTC = async () => {
    if (!tcSelId) return
    setErrTC(null)
    const lim = parseFloat(tcLimite)
    const cie = parseInt(tcCierre)
    const pag = parseInt(tcPago)
    if (!tcNombre.trim())                  return setErrTC('El nombre es requerido')
    if (isNaN(lim) || lim <= 0)            return setErrTC('El límite debe ser mayor a Q0')
    if (isNaN(cie) || cie < 1 || cie > 31) return setErrTC('Día de cierre inválido (1-31)')
    if (isNaN(pag) || pag < 1 || pag > 31) return setErrTC('Día de pago inválido (1-31)')
    const errFecha = validarFechasTC(cie, pag)
    if (errFecha) return setErrTC(errFecha)
    try {
      setSavingTC(true)
      await actualizarTC(tcSelId, {
        nombre:         tcNombre.trim(),
        banco:          tcBanco.trim() || undefined,
        ultimos_4:      tcUlt4.replace(/\D/g, '').slice(0, 4) || undefined,
        limite_credito: toCentavos(lim),
        dia_cierre:     cie,
        dia_pago:       pag,
        color:          tcColor,
      })
      setPantalla('lista')
    } catch (e: unknown) {
      setErrTC(e instanceof Error ? e.message : 'Error al actualizar')
    } finally {
      setSavingTC(false)
    }
  }

  const handleArchivarTC = async (tcId: string) => {
    try {
      await archivarTC(tcId)
      setPantalla('lista')
    } catch (e: unknown) {
      setErrTC(e instanceof Error ? e.message : 'Error al archivar')
    }
  }

  const handleCargo = async () => {
    if (!tcSelId || !tcSel) return
    setErrCargo(null)
    const monto = parseFloat(cargoMonto)
    if (isNaN(monto) || monto <= 0)   return setErrCargo('El monto debe ser mayor a Q0')
    if (!cargoDesc.trim())            return setErrCargo('La descripción es requerida')
    const montoCent  = toCentavos(monto)
    const disponible = tcSel.tc.limite_credito - tcSel.tc.deuda_actual
    if (montoCent > disponible)       return setErrCargo(`Excede el disponible (${formatQ(disponible)})`)
    try {
      setSavingCargo(true)
      await registrarCargo({
        tarjeta_id:  tcSelId,
        monto:       montoCent,
        descripcion: cargoDesc.trim(),
        categoria:   cargoCat,
        fecha:       cargoFecha,
      })
      setPantalla('lista')
    } catch (e: unknown) {
      setErrCargo(e instanceof Error ? e.message : 'Error al registrar')
    } finally {
      setSavingCargo(false)
    }
  }

  const handlePago = async () => {
    if (!tcSelId) return
    setErrPago(null)
    const monto = parseFloat(pagoMonto)
    if (isNaN(monto) || monto <= 0)  return setErrPago('El monto debe ser mayor a Q0')
    if (!pagoCuenta)                 return setErrPago('Selecciona una cuenta')
    try {
      setSavingPago(true)
      await registrarPago({
        tarjeta_id: tcSelId,
        monto:      toCentavos(monto),
        cuenta_id:  pagoCuenta,
        fecha:      pagoFecha,
      })
      setPantalla('lista')
    } catch (e: unknown) {
      setErrPago(e instanceof Error ? e.message : 'Error al registrar')
    } finally {
      setSavingPago(false)
    }
  }

  const handleCerrarCiclo = async () => {
    if (!tcSelId) return
    setErrCerrar(null)
    try {
      setSavingCerrar(true)
      await cerrarCiclo(tcSelId)
      setPantalla('lista')
    } catch (e: unknown) {
      setErrCerrar(e instanceof Error ? e.message : 'Error al cerrar ciclo')
    } finally {
      setSavingCerrar(false)
    }
  }

  // ── UI helpers ─────────────────────────────────────────────────
  const disponibleTrasCargo = (tc: TarjetaCredito) => {
    const monto = parseFloat(cargoMonto)
    if (isNaN(monto) || monto <= 0) return null
    return tc.limite_credito - tc.deuda_actual - toCentavos(monto)
  }

  // archivarTC used via handleArchivarTC inside modals

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-muted text-sm">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white font-display font-bold text-xl">Tarjetas de Crédito</h1>
          {totalDeuda > 0 && (
            <p className="text-danger text-xs mt-0.5">
              Deuda total: <span className="font-mono">{formatQ(totalDeuda)}</span>
            </p>
          )}
        </div>
        <button
          onClick={abrirNuevaTC}
          className="bg-accent text-bg px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          + Nueva TC
        </button>
      </div>

      {error && (
        <p className="text-danger text-sm bg-danger/10 rounded-xl p-3 mb-4">{error}</p>
      )}

      {/* Empty state */}
      {resumenTCs.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">💳</p>
          <p className="text-muted text-sm">No tienes tarjetas registradas</p>
          <p className="text-textDim text-xs mt-1">Agrega tu primera TC para empezar</p>
        </div>
      )}

      {/* Lista de TCs */}
      <div className="flex flex-col gap-4">
        {resumenTCs.map(({ tc, resumen }) => (
          <div key={tc.id} className="bg-surface rounded-2xl p-4 space-y-3">
            {/* TC header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: tc.color }} />
                <div>
                  <p className="text-white font-semibold text-sm">{tc.nombre}</p>
                  {(tc.banco || tc.ultimos_4) && (
                    <p className="text-muted text-xs">
                      {tc.banco}{tc.ultimos_4 ? ` ••••${tc.ultimos_4}` : ''}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  resumen.estado === 'critico' ? 'bg-danger/10 text-danger' :
                  resumen.estado === 'alerta'  ? 'bg-warning/10 text-warning' :
                                                 'bg-success/10 text-success'
                }`}>
                  {resumen.pct_uso}% usado
                </span>
                <button
                  onClick={() => abrirEditarTC(tc.id)}
                  className="text-muted hover:text-white transition-colors text-sm leading-none px-1"
                  title="Editar tarjeta"
                >
                  ✎
                </button>
              </div>
            </div>

            {/* Disponible */}
            <div>
              <p className="text-muted text-xs mb-0.5">Disponible</p>
              <p className="text-white font-mono font-bold text-2xl">{formatQ(resumen.disponible)}</p>
            </div>

            {/* Barra de uso */}
            <div className="h-1.5 bg-bg rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  resumen.estado === 'critico' ? 'bg-danger' :
                  resumen.estado === 'alerta'  ? 'bg-warning' : 'bg-success'
                }`}
                style={{ width: `${Math.min(resumen.pct_uso, 100)}%` }}
              />
            </div>

            {/* Detalle deuda */}
            <div className="flex justify-between text-xs">
              <span className="text-muted">
                Ciclo actual: <span className="text-white font-mono">{formatQ(tc.deuda_actual)}</span>
              </span>
              <span className="text-muted">
                Límite: <span className="text-white font-mono">{formatQ(tc.limite_credito)}</span>
              </span>
            </div>

            {/* Banner deuda vencida */}
            {tc.deuda_ciclo_anterior > 0 && (
              <div className="bg-danger/10 border border-danger/20 rounded-xl p-3">
                <p className="text-danger text-xs font-semibold">
                  ⚠ Pagar {formatQ(tc.deuda_ciclo_anterior)} antes del día {tc.dia_pago}
                </p>
                <p className="text-danger/70 text-xs mt-0.5">
                  {resumen.dias_para_pago} días restantes para el pago
                </p>
              </div>
            )}

            {/* Fechas */}
            <div className="flex gap-4 text-xs text-muted">
              <span>Cierre en <span className="text-white">{resumen.dias_para_cierre}d</span></span>
              <span>Pago en <span className="text-white">{resumen.dias_para_pago}d</span></span>
            </div>

            {/* Botones de acción */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => abrirCargo(tc.id)}
                className="flex-1 py-2 rounded-xl bg-accent/10 text-accent text-xs font-semibold hover:bg-accent/20 transition-colors"
              >
                + Cargo
              </button>
              <button
                onClick={() => abrirPago(tc.id)}
                className="flex-1 py-2 rounded-xl bg-surface2 text-white text-xs font-semibold hover:opacity-80 transition-opacity"
              >
                Pagar TC
              </button>
              <button
                onClick={() => { setTcSelId(tc.id); setErrCerrar(null); setPantalla('cerrar') }}
                disabled={tc.deuda_actual === 0}
                className="flex-1 py-2 rounded-xl bg-surface2 text-muted text-xs font-semibold hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Cerrar ciclo
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ═══════════════ MODALES ═══════════════ */}

      {/* Modal: Nueva TC */}
      {pantalla === 'nueva_tc' && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-50">
          <div className="bg-surface w-full rounded-t-2xl p-5 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-white font-semibold">Nueva tarjeta</h2>
              <button onClick={() => setPantalla('lista')} className="text-muted hover:text-white text-lg">✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <input
                placeholder="Nombre (ej: Visa BAC Personal)"
                value={tcNombre} onChange={e => setTcNombre(e.target.value)}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <input
                placeholder="Banco (opcional)"
                value={tcBanco} onChange={e => setTcBanco(e.target.value)}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <input
                placeholder="Últimos 4 dígitos (opcional)"
                value={tcUlt4} onChange={e => setTcUlt4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric" maxLength={4}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <input
                placeholder="Límite de crédito (Q)"
                value={tcLimite} onChange={e => setTcLimite(e.target.value)}
                inputMode="decimal"
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Día de cierre"
                  value={tcCierre} onChange={e => setTcCierre(e.target.value)}
                  inputMode="numeric"
                  className="flex-1 bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
                />
                <input
                  placeholder="Día de pago"
                  value={tcPago} onChange={e => setTcPago(e.target.value)}
                  inputMode="numeric"
                  className="flex-1 bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <p className="text-muted text-xs mb-2">Color de la tarjeta</p>
                <div className="flex gap-2 flex-wrap">
                  {COLORES_TC.map(c => (
                    <button
                      key={c}
                      onClick={() => setTcColor(c)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${tcColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
              {errTC && <p className="text-danger text-sm">{errTC}</p>}
              <button
                onClick={handleNuevaTC}
                disabled={savingTC}
                className="w-full py-3 rounded-xl bg-accent text-bg font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity mt-2"
              >
                {savingTC ? 'Guardando...' : 'Agregar tarjeta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar TC */}
      {pantalla === 'editar_tc' && tcSel && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-50">
          <div className="bg-surface w-full rounded-t-2xl p-5 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-white font-semibold">Editar tarjeta</h2>
              <button onClick={() => setPantalla('lista')} className="text-muted hover:text-white text-lg">✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <input
                placeholder="Nombre (ej: Visa BAC Personal)"
                value={tcNombre} onChange={e => setTcNombre(e.target.value)}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <input
                placeholder="Banco (opcional)"
                value={tcBanco} onChange={e => setTcBanco(e.target.value)}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <input
                placeholder="Últimos 4 dígitos (opcional)"
                value={tcUlt4} onChange={e => setTcUlt4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric" maxLength={4}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <input
                placeholder="Límite de crédito (Q)"
                value={tcLimite} onChange={e => setTcLimite(e.target.value)}
                inputMode="decimal"
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Día de cierre"
                  value={tcCierre} onChange={e => setTcCierre(e.target.value)}
                  inputMode="numeric"
                  className="flex-1 bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
                />
                <input
                  placeholder="Día de pago"
                  value={tcPago} onChange={e => setTcPago(e.target.value)}
                  inputMode="numeric"
                  className="flex-1 bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <p className="text-muted text-xs mb-2">Color de la tarjeta</p>
                <div className="flex gap-2 flex-wrap">
                  {COLORES_TC.map(c => (
                    <button
                      key={c}
                      onClick={() => setTcColor(c)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${tcColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
              {errTC && <p className="text-danger text-sm">{errTC}</p>}
              <button
                onClick={handleEditarTC}
                disabled={savingTC}
                className="w-full py-3 rounded-xl bg-accent text-bg font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity mt-2"
              >
                {savingTC ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button
                onClick={() => handleArchivarTC(tcSel.tc.id)}
                disabled={savingTC}
                className="w-full py-2 rounded-xl bg-transparent text-danger/70 text-xs hover:text-danger transition-colors"
              >
                Archivar tarjeta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Nuevo cargo TC */}
      {pantalla === 'cargo' && tcSel && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-50">
          <div className="bg-surface w-full rounded-t-2xl p-5 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-white font-semibold">Cargo — {tcSel.tc.nombre}</h2>
              <button onClick={() => setPantalla('lista')} className="text-muted hover:text-white text-lg">✕</button>
            </div>

            {/* Preview disponible tras el cargo */}
            {cargoMonto && !isNaN(parseFloat(cargoMonto)) && (() => {
              const tras = disponibleTrasCargo(tcSel.tc)
              if (tras === null) return null
              return (
                <div className="bg-bg rounded-xl p-3 mb-4">
                  <p className="text-muted text-xs mb-0.5">Disponible tras este cargo</p>
                  <p className={`font-mono font-bold text-lg ${tras >= 0 ? 'text-success' : 'text-danger'}`}>
                    {formatQ(Math.max(0, tras))}
                  </p>
                  {tras < 0 && (
                    <p className="text-danger text-xs mt-1">⚠ Excede el disponible</p>
                  )}
                  {tras >= 0 && (tcSel.tc.deuda_actual + toCentavos(parseFloat(cargoMonto))) / tcSel.tc.limite_credito >= 0.9 && (
                    <p className="text-warning text-xs mt-1">⚠ Superarás el 90% de uso de la TC</p>
                  )}
                </div>
              )
            })()}

            <div className="flex flex-col gap-3">
              <input
                placeholder="Monto (Q)"
                value={cargoMonto} onChange={e => setCargoMonto(e.target.value)}
                inputMode="decimal"
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <input
                placeholder="Descripción"
                value={cargoDesc} onChange={e => setCargoDesc(e.target.value)}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <div>
                <p className="text-muted text-xs mb-2">Categoría</p>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIAS_GASTO.map(c => (
                    <button
                      key={c}
                      onClick={() => setCargoCat(c)}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        cargoCat === c ? 'bg-accent text-bg font-semibold' : 'bg-bg text-muted hover:text-white'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="date"
                value={cargoFecha} onChange={e => setCargoFecha(e.target.value)}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent"
              />
              {errCargo && <p className="text-danger text-sm">{errCargo}</p>}
              <button
                onClick={handleCargo}
                disabled={savingCargo}
                className="w-full py-3 rounded-xl bg-accent text-bg font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {savingCargo ? 'Registrando...' : 'Registrar cargo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Pagar TC */}
      {pantalla === 'pago' && tcSel && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-50">
          <div className="bg-surface w-full rounded-t-2xl p-5">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-white font-semibold">Pagar — {tcSel.tc.nombre}</h2>
              <button onClick={() => setPantalla('lista')} className="text-muted hover:text-white text-lg">✕</button>
            </div>

            {/* Resumen de deuda */}
            <div className="bg-bg rounded-xl p-3 mb-4 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted">Deuda vencida (pagar ya)</span>
                <span className={`font-mono ${tcSel.tc.deuda_ciclo_anterior > 0 ? 'text-danger' : 'text-muted'}`}>
                  {formatQ(tcSel.tc.deuda_ciclo_anterior)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted">Deuda ciclo actual</span>
                <span className="text-white font-mono">{formatQ(tcSel.tc.deuda_actual)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <input
                placeholder="Monto a pagar (Q)"
                value={pagoMonto} onChange={e => setPagoMonto(e.target.value)}
                inputMode="decimal"
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <select
                value={pagoCuenta} onChange={e => setPagoCuenta(e.target.value)}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent"
              >
                {cuentas.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} — {formatQ(c.saldo)}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={pagoFecha} onChange={e => setPagoFecha(e.target.value)}
                className="bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent"
              />
              {errPago && <p className="text-danger text-sm">{errPago}</p>}
              <button
                onClick={handlePago}
                disabled={savingPago}
                className="w-full py-3 rounded-xl bg-accent text-bg font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {savingPago ? 'Registrando...' : 'Registrar pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar cerrar ciclo */}
      {pantalla === 'cerrar' && tcSel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-surface rounded-2xl p-6 max-w-sm w-full">
            <h2 className="text-white font-semibold mb-2">¿Cerrar ciclo?</h2>
            <p className="text-muted text-sm mb-1">
              Tarjeta: <span className="text-white">{tcSel.tc.nombre}</span>
            </p>
            <p className="text-muted text-sm mb-4">
              Cargos del ciclo:{' '}
              <span className="text-white font-mono">{formatQ(tcSel.tc.deuda_actual)}</span>
              <br />
              <span className="text-textDim text-xs">
                Al cerrar, esta deuda pasará a "pendiente de pago" y el ciclo actual se reinicia en Q0.
              </span>
            </p>
            {errCerrar && <p className="text-danger text-sm mb-3">{errCerrar}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => setPantalla('lista')}
                className="flex-1 py-3 rounded-xl bg-bg text-muted text-sm font-semibold hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCerrarCiclo}
                disabled={savingCerrar}
                className="flex-1 py-3 rounded-xl bg-danger text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {savingCerrar ? 'Cerrando...' : 'Cerrar ciclo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
