// src/pages/CategoriasPage.tsx
import { useState } from 'react'
import Aviso from '../components/Aviso'
import TituloGrande from '../components/TituloGrande'
import EstadoVacio from '../components/EstadoVacio'
import Campo from '../components/Campo'
import { IconoCerrar } from '../components/iconos'
import { type CategoriaUsuario } from '../hooks/useCategorias'
import { useSesion } from '../context/sesion'
import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO } from '../lib/constants'


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

export default function CategoriasPage() {
  // Datos del contexto de sesión: ya cargados una vez en el provider, no se
  // vuelve a consultar categorias_usuario al entrar a esta página.
  const {
    categoriasPropias: custom,
    cargando, error: errores,
    agregarCategoria, eliminarCategoria,
  } = useSesion()
  const loading = cargando.categorias
  const error = errores.categorias

  const [showAdd, setShowAdd]         = useState(false)
  const [nombre, setNombre]           = useState('')
  const [tipo, setTipo]               = useState<Tipo>('gasto')
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState<string | null>(null)
  const [confirmDel, setConfirmDel]   = useState<string | null>(null)
  const [delError, setDelError]       = useState<string | null>(null)

  const handleAgregar = async () => {
    const n = nombre.trim()
    if (!n) return
    // No duplicates with base categories
    const allBase = [...CATEGORIAS_GASTO, ...CATEGORIAS_INGRESO]
    if (allBase.some(base => base.toLowerCase() === n.toLowerCase())) {
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
    setDelError(null)
    try {
      await eliminarCategoria(id)
      setConfirmDel(null)
    } catch (e: unknown) {
      // Un borrado fallido no puede quedar silencioso: la fila sigue en la
      // lista y el usuario creeria que se elimino.
      setDelError(e instanceof Error ? e.message : 'No se pudo eliminar la categoría')
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pb-6">
      <div className="mb-6">
        <TituloGrande
          titulo="Categorías"
          subtitulo="Personaliza tus categorías de gastos"
          volver={{ a: '/ajustes', etiqueta: 'Ajustes' }}
        />
      </div>

      {error && (
        <Aviso clase="mb-4">{error}</Aviso>
      )}

      {/* Custom categories */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-text text-sm font-semibold">Mis categorías</h2>
          <button
            onClick={() => { setShowAdd(v => !v); setSaveError(null) }}
            className="text-xs text-accent hover:opacity-80 transition-opacity font-medium"
          >
            {showAdd ? '× Cancelar' : '+ Agregar'}
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="vidrio-panel rounded-2xl p-4 mb-3">
            <div className="flex flex-col gap-3">
              <Campo
                etiqueta="Nombre" placeholder="ej. Médico, Educación…" maxLength={50}
                value={nombre} onChange={e => setNombre(e.target.value)}
              />
              <Campo
                etiqueta="Tipo" tipo="select"
                value={tipo} onChange={e => setTipo(e.target.value as Tipo)}
              >
                <option value="gasto">Gasto — aparece en gastos y presupuesto</option>
                <option value="ingreso">Ingreso — aparece en ingresos</option>
                <option value="ambos">Ambos — aparece en gastos e ingresos</option>
              </Campo>
              {saveError && (
                <Aviso>{saveError}</Aviso>
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

        {delError && (
          <Aviso clase="mb-3">{delError}</Aviso>
        )}

        {loading ? (
          <p className="text-textDim text-sm text-center py-4">Cargando...</p>
        ) : custom.length === 0 ? (
          <EstadoVacio
            icono="🏷️"
            titulo="Sin categorías personalizadas"
            pista="Agrega categorías que aparecerán en tus gastos y presupuesto"
          />
        ) : (
          <div className="flex flex-col gap-2">
            {custom.map((cat: CategoriaUsuario) => (
              <div key={cat.id} className="vidrio-panel rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ background: cat.color }}
                  />
                  <span className="text-text text-sm">{cat.nombre}</span>
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
                      className="text-textDim text-xs hover:text-text"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDel(cat.id)}
                    aria-label={`Eliminar ${cat.nombre}`}
                    className="presionable text-textDim hover:text-danger transition-colors"
                  >
                    <IconoCerrar size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Base categories (read-only reference) */}
      <div className="border-t border-perimetro pt-5">
        <h2 className="text-text text-sm font-semibold mb-3">Categorías base (no editables)</h2>
        <div className="flex flex-wrap gap-2">
          {[...CATEGORIAS_GASTO, ...CATEGORIAS_INGRESO.filter(c => !CATEGORIAS_GASTO.includes(c))].map(c => (
            <span
              key={c}
              className="text-xs text-textDim vidrio-panel px-3 py-1 rounded-full"
            >
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
