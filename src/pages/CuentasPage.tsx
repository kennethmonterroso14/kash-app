import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useCuentas } from '../hooks/useCuentas'
import { formatQ, toCentavos } from '../lib/finanzas'
import { supabase } from '../lib/supabase'
import { hoyGT } from '../lib/constants'

interface Props { user: User }

const TIPO_OPCIONES = ['ahorro', 'corriente', 'efectivo', 'inversion', 'otro'] as const
const COLORES = [
  '#4ade80','#34d399','#60a5fa','#a78bfa','#e879f9',
  '#fbbf24','#fb923c','#f472b6','#ff7c5c','#67e8f9',
  '#c8f564','#facc15','#94a3b8','#86efac','#c4b5fd',
]

export default function CuentasPage({ user }: Props) {
  const { cuentas, loading, totalPatrimonio } = useCuentas(user.id)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<typeof TIPO_OPCIONES[number]>('ahorro')
  const [saldoInput, setSaldoInput] = useState('')
  const [color, setColor] = useState(COLORES[0])

  // Ajuste de saldo
  const [ajustandoCuenta, setAjustandoCuenta] = useState<{ id: string; nombre: string } | null>(null)
  const [ajusteInput, setAjusteInput] = useState('')
  const [ajusteSaving, setAjusteSaving] = useState(false)
  const [ajusteError, setAjusteError] = useState('')

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const saldoQ = parseFloat(saldoInput)
    if (!nombre.trim() || isNaN(saldoQ) || saldoQ < 0) return
    setSaving(true)
    setError('')

    const saldoCentavos = toCentavos(saldoQ)

    // 1. Crear la cuenta con saldo 0 (el trigger lo actualizará)
    const { data: cuenta, error: cuentaError } = await supabase
      .from('cuentas')
      .insert({ user_id: user.id, nombre: nombre.trim(), tipo, saldo: 0, color })
      .select('id, nombre')
      .single()

    if (cuentaError) { setError(cuentaError.message); setSaving(false); return }

    // 2. Insertar ajuste inicial si el saldo > 0
    if (saldoCentavos > 0) {
      const { error: txnError } = await supabase.from('transacciones').insert({
        user_id: user.id,
        cuenta_id: cuenta.id,
        fecha: hoyGT(),
        cantidad: saldoCentavos,
        descripcion: `Saldo inicial ${cuenta.nombre}`,
        categoria: 'Ajuste de cuenta',
        tipo: 'ajuste',
      })
      if (txnError) { setError(txnError.message); setSaving(false); return }
    }

    // Reset form
    setNombre('')
    setSaldoInput('')
    setTipo('ahorro')
    setColor(COLORES[0])
    setShowForm(false)
    setSaving(false)
    // Recargar cuentas
    window.location.reload()
  }

  const handleAjuste = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ajustandoCuenta) return
    const val = parseFloat(ajusteInput)
    if (isNaN(val) || val === 0) { setAjusteError('Ingresa un monto distinto de cero'); return }
    setAjusteSaving(true)
    setAjusteError('')
    const { error: txnError } = await supabase.from('transacciones').insert({
      user_id: user.id,
      cuenta_id: ajustandoCuenta.id,
      fecha: hoyGT(),
      cantidad: toCentavos(Math.abs(val)) * (val < 0 ? -1 : 1),
      descripcion: `Ajuste de saldo — ${ajustandoCuenta.nombre}`,
      categoria: 'Ajuste de cuenta',
      tipo: 'ajuste',
    })
    if (txnError) { setAjusteError(txnError.message); setAjusteSaving(false); return }
    setAjustandoCuenta(null)
    setAjusteInput('')
    setAjusteSaving(false)
    window.location.reload()
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      {/* Total + botón agregar */}
      <div className="bg-surface rounded-2xl p-5 flex justify-between items-start">
        <div>
          <p className="text-muted text-xs uppercase tracking-widest mb-1">Patrimonio total</p>
          <p className="text-3xl font-mono font-bold text-white">{formatQ(totalPatrimonio)}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-accent text-bg font-semibold text-sm px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
        >
          + Cuenta
        </button>
      </div>

      {loading && <p className="text-muted text-center py-8">Cargando...</p>}

      {!loading && cuentas.length === 0 && (
        <div className="bg-surface rounded-2xl p-8 text-center">
          <p className="text-white font-medium mb-1">Sin cuentas aún</p>
          <p className="text-muted text-sm mb-4">Agrega tu primera cuenta para empezar a registrar movimientos.</p>
          <button
            onClick={() => setShowForm(true)}
            className="bg-accent text-bg font-semibold px-6 py-2 rounded-xl hover:opacity-90"
          >
            Agregar cuenta
          </button>
        </div>
      )}

      {/* Grid de cuentas */}
      <div className="grid grid-cols-2 gap-3">
        {cuentas.map(c => (
          <div key={c.id} className="bg-surface rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full" style={{ background: c.color }} />
              <span className="text-muted text-xs capitalize">{c.tipo}</span>
            </div>
            <p className="text-white text-sm font-medium mb-1">{c.nombre}</p>
            <p className={`font-mono font-semibold ${c.saldo >= 0 ? 'text-white' : 'text-danger'}`}>
              {formatQ(c.saldo)}
            </p>
            <button
              onClick={() => { setAjustandoCuenta({ id: c.id, nombre: c.nombre }); setAjusteInput(''); setAjusteError('') }}
              className="mt-2 text-xs text-muted hover:text-accent transition-colors"
            >
              ± Ajustar saldo
            </button>
          </div>
        ))}
      </div>

      {/* Modal ajuste de saldo */}
      {ajustandoCuenta && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setAjustandoCuenta(null) }}
        >
          <div className="bg-surface w-full max-w-lg rounded-t-3xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-white font-semibold">Ajustar — {ajustandoCuenta.nombre}</h2>
              <button onClick={() => setAjustandoCuenta(null)} className="text-muted text-xl">×</button>
            </div>
            <p className="text-muted text-sm">Ingresa un valor positivo para sumar o negativo para restar del saldo.</p>
            <form onSubmit={handleAjuste} className="space-y-3">
              <div>
                <label className="text-muted text-xs mb-1 block">Monto (Q)</label>
                <input
                  type="number"
                  step="0.01"
                  value={ajusteInput}
                  onChange={e => setAjusteInput(e.target.value)}
                  required
                  placeholder="ej. -500.00 o 200.00"
                  className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white text-xl font-mono focus:outline-none focus:border-accent"
                />
              </div>
              {ajusteError && <p className="text-danger text-xs">{ajusteError}</p>}
              <button
                type="submit"
                disabled={ajusteSaving}
                className="w-full bg-accent text-bg font-semibold py-3 rounded-xl hover:opacity-90 disabled:opacity-50"
              >
                {ajusteSaving ? 'Guardando...' : 'Aplicar ajuste'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal agregar cuenta */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}
        >
          <div className="bg-surface w-full max-w-lg rounded-t-3xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-white font-semibold">Nueva cuenta</h2>
              <button onClick={() => setShowForm(false)} className="text-muted text-xl">×</button>
            </div>

            <form onSubmit={handleAdd} className="space-y-4">
              {/* Nombre */}
              <div>
                <label className="text-muted text-xs mb-1 block">Nombre</label>
                <input
                  type="text"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  required
                  placeholder="ej. BI Ahorros"
                  className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent"
                />
              </div>

              {/* Tipo + Saldo inicial */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-muted text-xs mb-1 block">Tipo</label>
                  <select
                    value={tipo}
                    onChange={e => setTipo(e.target.value as typeof TIPO_OPCIONES[number])}
                    className="w-full bg-bg border border-muted/30 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-accent capitalize"
                  >
                    {TIPO_OPCIONES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-muted text-xs mb-1 block">Saldo actual (Q)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={saldoInput}
                    onChange={e => setSaldoInput(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-bg border border-muted/30 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="text-muted text-xs mb-2 block">Color</label>
                <div className="flex flex-wrap gap-2">
                  {COLORES.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-white ring-offset-1 ring-offset-surface' : ''}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-danger text-sm bg-danger/10 rounded-xl px-4 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full bg-accent text-bg font-semibold py-3 rounded-xl hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Agregar cuenta'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
