import { useState } from 'react'
import { useSesion } from '../context/sesion'
import { useMoneda } from '../hooks/useMoneda'
import ModalNuevaCuenta from './cuentas/ModalNuevaCuenta'
import ModalAjusteSaldo from './cuentas/ModalAjusteSaldo'

export default function CuentasPage() {
  const { cuentas, totalPatrimonio, cargando, error: errores } = useSesion()
  const fmt = useMoneda()
  const cargandoCuentas = cargando.cuentas
  const error = errores.cuentas

  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [ajustando, setAjustando] = useState<{ id: string; nombre: string } | null>(null)

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <div className="bg-surface rounded-tarjeta p-5 flex justify-between items-start gap-2">
        <div className="min-w-0">
          <p className="text-textDim text-xs uppercase tracking-widest mb-1">Patrimonio total</p>
          {/* Con la consulta fallida el total es 0, y mostrar ese 0 como un
              hecho es justo el defecto que se estaba corrigiendo. */}
          <p className="text-3xl font-mono font-bold text-text tracking-display">
            {error ? '—' : fmt(totalPatrimonio)}
          </p>
        </div>
        <button
          onClick={() => setMostrarAlta(true)}
          className="presionable bg-accent text-bg font-semibold text-sm px-4 py-2 rounded-control flex-shrink-0"
        >
          + Cuenta
        </button>
      </div>

      {cargandoCuentas && <p className="text-textDim text-center py-8">Cargando...</p>}

      {error && (
        <p role="alert" className="text-danger text-sm bg-danger/10 rounded-control px-4 py-3">
          No se pudieron cargar tus cuentas: {error}
        </p>
      )}

      {!cargandoCuentas && !error && cuentas.length === 0 && (
        <div className="bg-surface rounded-tarjeta p-8 text-center">
          <p className="text-text font-medium mb-1">Sin cuentas aún</p>
          <p className="text-textDim text-sm mb-4">
            Agrega tu primera cuenta para empezar a registrar movimientos.
          </p>
          <button
            onClick={() => setMostrarAlta(true)}
            className="presionable bg-accent text-bg font-semibold px-6 py-2 rounded-control"
          >
            Agregar cuenta
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {cuentas.map(c => (
          <div key={c.id} className="bg-surface rounded-tarjeta p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: c.color }} />
              <span className="text-textDim text-xs capitalize tracking-micro">{c.tipo}</span>
            </div>
            <p className="text-text text-sm font-medium mb-1 truncate">{c.nombre}</p>
            <p className={`font-mono font-semibold ${c.saldo >= 0 ? 'text-text' : 'text-danger'}`}>
              {fmt(c.saldo)}
            </p>
            <button
              onClick={() => setAjustando({ id: c.id, nombre: c.nombre })}
              className="presionable mt-2 text-xs text-textDim hover:text-accent"
            >
              ± Ajustar saldo
            </button>
          </div>
        ))}
      </div>

      {mostrarAlta && <ModalNuevaCuenta onCerrar={() => setMostrarAlta(false)} />}
      {ajustando && (
        <ModalAjusteSaldo cuenta={ajustando} onCerrar={() => setAjustando(null)} />
      )}
    </div>
  )
}
