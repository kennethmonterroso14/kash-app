import { useState } from 'react'
import Aviso from '../components/Aviso'
import EstadoVacio from '../components/EstadoVacio'
import AvatarCategoria from '../components/AvatarCategoria'
import { useSesion } from '../context/sesion'
import { useMoneda } from '../hooks/useMoneda'
import ModalCuenta from './cuentas/ModalCuenta'
import { IconoEditar } from '../components/iconos'
import type { Cuenta } from '../hooks/useCuentas'
import ModalAjusteSaldo from './cuentas/ModalAjusteSaldo'

export default function CuentasPage() {
  const { cuentas, totalPatrimonio, cargando, error: errores } = useSesion()
  const fmt = useMoneda()
  const cargandoCuentas = cargando.cuentas
  const error = errores.cuentas

  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [editando, setEditando] = useState<Cuenta | null>(null)
  const positivas = cuentas.filter(c => c.saldo > 0)
  const [ajustando, setAjustando] = useState<{ id: string; nombre: string; saldo: number } | null>(null)

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-6 space-y-4">
      <div className="vidrio-panel rounded-tarjeta p-5">
        <div className="flex justify-between items-center gap-2 mb-1">
          <p className="text-textDim text-[15px] font-semibold">Patrimonio total</p>
          <button
            onClick={() => setMostrarAlta(true)}
            className="presionable h-8 px-3 rounded-full bg-accent/15 text-accent text-[14px] font-semibold flex-shrink-0"
          >
            + Cuenta
          </button>
        </div>
        {/* Con la consulta fallida el total es 0, y mostrar ese 0 como un
            hecho es justo el defecto que se estaba corrigiendo. */}
        <p className="text-[40px] leading-[46px] tabular-nums font-bold text-text tracking-display">
          {error ? '—' : fmt(totalPatrimonio)}
        </p>
        {/* Cómo se reparte: una barra por cuenta, cada una tan ancha como su
            saldo (flex-grow = saldo, sin aritmética). Un saldo negativo no
            tiene ancho que mostrar, así que queda fuera de la barra — y sigue
            en rojo en la lista de abajo. */}
        {!error && positivas.length > 0 && (
          <div aria-hidden="true" className="flex gap-1 h-2.5 mt-4">
            {positivas.map(c => (
              <div key={c.id} className="rounded-full min-w-1.5" style={{ flexGrow: c.saldo, background: c.color }} />
            ))}
          </div>
        )}
      </div>

      {cargandoCuentas && <p className="text-textDim text-center py-8">Cargando...</p>}

      {error && (
        <Aviso>
          No se pudieron cargar tus cuentas: {error}
        </Aviso>
      )}

      {!cargandoCuentas && !error && cuentas.length === 0 && (
        <EstadoVacio
          titulo="Sin cuentas aún"
          pista="Agrega tu primera cuenta para empezar a registrar movimientos."
        >
          <button
            onClick={() => setMostrarAlta(true)}
            className="presionable bg-accent text-bg font-semibold px-6 py-2 rounded-full"
          >
            Agregar cuenta
          </button>
        </EstadoVacio>
      )}

      {cuentas.length > 0 && (
        <ul className="vidrio-panel rounded-tarjeta px-4">
          {cuentas.map(c => (
            <li key={c.id} className="flex items-center gap-3 min-h-[64px] py-2 border-t border-perimetro first:border-t-0">
              {/* Tocar la cuenta la edita (nombre, tipo, color, eliminar). El
                  saldo va aparte, en "Cambiar saldo", porque es un movimiento. */}
              <button
                type="button"
                onClick={() => setEditando(c)}
                aria-label={`Editar ${c.nombre}`}
                className="presionable flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <AvatarCategoria categoria={c.nombre} color={c.color} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5 text-text text-[16px]">
                    <span className="truncate">{c.nombre}</span>
                    <IconoEditar size={13} className="text-textDim shrink-0" />
                  </span>
                  <span className="block text-textDim text-[13px] capitalize">{c.tipo}</span>
                </span>
              </button>
              <div className="text-right flex-shrink-0">
                <p className={`tabular-nums text-[16px] font-semibold ${c.saldo >= 0 ? 'text-text' : 'text-danger'}`}>
                  {fmt(c.saldo)}
                </p>
                <button
                  onClick={() => setAjustando({ id: c.id, nombre: c.nombre, saldo: c.saldo })}
                  aria-label={`Cambiar el saldo de ${c.nombre}`}
                  className="presionable text-[13px] text-accent"
                >
                  Cambiar saldo
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {mostrarAlta && <ModalCuenta onCerrar={() => setMostrarAlta(false)} />}
      {editando && <ModalCuenta cuenta={editando} onCerrar={() => setEditando(null)} />}
      {ajustando && (
        <ModalAjusteSaldo cuenta={ajustando} onCerrar={() => setAjustando(null)} />
      )}
    </div>
  )
}
