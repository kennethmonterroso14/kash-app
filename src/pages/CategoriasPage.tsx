// src/pages/CategoriasPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCategorias, type CategoriaUsuario } from '../hooks/useCategorias'
import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO } from '../lib/constants'

interface Props { userId: string }

type Tipo = 'gasto' | 'ingreso' | 'ambos'

const TIPO_LABEL: Record<Tipo, string> = {
  gasto:   'Gasto',
  ingreso: 'Ingreso',
  ambos:   'Ambos',
}

const TIPO_COLOR: Record<Tipo, string> = {
  gasto:   'bg-danger/15 text-danger',
  ingreso: 'bg-success/15 text-success',
  ambos:   'bg-accent/15 text-accent',
}

export default function CategoriasPage({ userId }: Props) {
  const navigate = useNavigate()
  const { custom, loading, error, agregarCategoria, eliminarCategoria } = useCategorias(userId)

  const [showAdd, setShowAdd]         = useState(false)
  const [nombre, setNombre]           = useState('')
  const [tipo, setTipo]               = useState<Tipo>('gasto')
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState<string | null>(null)
  const [confirmDel, setConfirmDel]   = useState<string | null>(null)

  const handleAgregar = async () => {
    const n = nombre.trim()
    if (!n) return
    // No duplicates with base categories
    const allBase = [...CATEGORIAS_GASTO, ...CATEGORIAS_INGRESO]
    if (allBase.includes(n)) {
      setSaveError('Esa categoría ya existe en las categorías base.')
      return
    }
    if (custom.some(c => c.nombre.toLowerCase() === n.toLowerCase())) {
      setSaveError('Ya tienes una categoría con ese nombre.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await agregarCategoria(n, tipo)
      setNombre('')
      setTipo('gasto')
      setShowAdd(false)
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleEliminar = async (id: string) => {
    try {
      await eliminarCategoria(id)
      setConfirmDel(null)
    } catch (e: unknown) {
      console.error(e)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/perfil')}
          className="text-accent text-xl hover:opacity-80 transition-opacity"
        >
          ←
        </button>
        <div>
          <h1 className="text-white font-display font-bold text-xl">Categorías</h1>
          <p className="text-muted text-xs">Personaliza tus categorías de gastos</p>
        </div>
      </div>

      {error && (
        <p className="text-danger text-sm bg-danger/10 rounded-xl p-3 mb-4">{error}</p>
      )}

      {/* Custom categories */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-white text-sm font-semibold">Mis categorías</h2>
          <button
            onClick={() => { setShowAdd(v => !v); setSaveError(null) }}
            className="text-xs text-accent hover:opacity-80 transition-opacity font-medium"
          >
            {showAdd ? '✕ Cancelar' : '+ Agregar'}
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="bg-surface rounded-2xl p-4 mb-3">
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-muted text-xs mb-1 block">Nombre</label>
                <input
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  placeholder="Ej: Médico, Educación..."
                  maxLength={50}
                  className="w-full bg-bg text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="text-muted text-xs mb-1 block">Tipo</label>
                <select
                  value={tipo}
                  onChange={e => setTipo(e.target.value as Tipo)}
                  className="w-full bg-bg text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="gasto">Gasto — aparece en gastos y presupuesto</option>
                  <option value="ingreso">Ingreso — aparece en ingresos</option>
                  <option value="ambos">Ambos — aparece en gastos e ingresos</option>
                </select>
              </div>
              {saveError && (
                <p className="text-danger text-xs">{saveError}</p>
              )}
              <button
                onClick={handleAgregar}
                disabled={saving || !nombre.trim()}
                className="w-full py-2.5 rounded-xl bg-accent text-bg font-semibold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {saving ? 'Guardando...' : 'Guardar categoría'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-muted text-sm text-center py-4">Cargando...</p>
        ) : custom.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-3xl mb-2">🏷️</p>
            <p className="text-muted text-sm">Sin categorías personalizadas</p>
            <p className="text-textDim text-xs mt-1">Agrega categorías que aparecerán en tus gastos y presupuesto</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {custom.map((cat: CategoriaUsuario) => (
              <div key={cat.id} className="bg-surface rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ background: cat.color }}
                  />
                  <span className="text-white text-sm">{cat.nombre}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${TIPO_COLOR[cat.tipo]}`}>
                    {TIPO_LABEL[cat.tipo]}
                  </span>
                </div>
                {confirmDel === cat.id ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEliminar(cat.id)}
                      className="text-danger text-xs font-semibold hover:opacity-80"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => setConfirmDel(null)}
                      className="text-muted text-xs hover:text-white"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDel(cat.id)}
                    className="text-muted hover:text-danger text-base transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Base categories (read-only reference) */}
      <div className="border-t border-muted/20 pt-5">
        <h2 className="text-white text-sm font-semibold mb-3">Categorías base (no editables)</h2>
        <div className="flex flex-wrap gap-2">
          {[...CATEGORIAS_GASTO, ...CATEGORIAS_INGRESO.filter(c => !CATEGORIAS_GASTO.includes(c))].map(c => (
            <span
              key={c}
              className="text-xs text-muted bg-surface px-3 py-1 rounded-full"
            >
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
