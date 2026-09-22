import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Aviso from '../components/Aviso'
import { useSesion } from '../context/sesion'
import DialogoBorrarCuenta from './ajustes/DialogoBorrarCuenta'

interface Props {
  onSignOut: () => void
}

/**
 * Configuración y la cuenta. Antes era `PerfilPage` y funcionaba como el cajón
 * donde caían las seis secciones que no entraron en la nav; ahora esas viven en
 * sus destinos y acá queda solo lo que de verdad es configuración.
 */
export default function AjustesPage({ onSignOut }: Props) {
  const navigate = useNavigate()
  const [confirmarSalida, setConfirmarSalida] = useState(false)
  const [borrarCuenta, setBorrarCuenta] = useState(false)
  // Sin consulta propia: el perfil ya viene del contexto.
  const { perfil, email, error: errores } = useSesion()
  const nombre = perfil.nombre
  const errorPerfil = errores.perfil ? 'No se pudo cargar tu perfil' : null

  const inicial = (email ?? 'U')[0].toUpperCase()
  const nombreVisible = nombre ?? email ?? 'Usuario'

  const AJUSTES = [
    { to: '/ajustes/pagos',      icon: '↻',  label: 'Pagos Fijos',
      detalle: 'Se aplican solos cada mes' },
    { to: '/ajustes/categorias', icon: '🏷️', label: 'Categorías',
      detalle: 'Las tuyas, además de las base' },
  ]

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="flex flex-col items-center gap-3 mt-4 mb-8">
        <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center">
          <span className="text-accent text-2xl font-bold">{inicial}</span>
        </div>
        <div className="text-center">
          <p className="text-text font-semibold text-lg tracking-titulo">{nombreVisible}</p>
          {nombre && email && <p className="text-textDim text-sm mt-0.5">{email}</p>}
          {errorPerfil && <Aviso clase="mt-1">{errorPerfil}</Aviso>}
        </div>
      </div>

      <div className="border-t border-perimetro mb-6" />

      <div className="flex flex-col gap-2 mb-6">
        {AJUSTES.map(({ to, icon, label, detalle }) => (
          <button
            key={to}
            onClick={() => navigate(to)}
            className="presionable w-full flex items-center justify-between px-4 py-3 bg-surface rounded-panel gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-lg flex-shrink-0">{icon}</span>
              <div className="text-left min-w-0">
                <p className="text-text text-sm font-medium">{label}</p>
                <p className="text-textDim text-xs tracking-micro truncate">{detalle}</p>
              </div>
            </div>
            <span className="text-textDim text-sm flex-shrink-0">›</span>
          </button>
        ))}
      </div>

      <div className="border-t border-perimetro mb-6" />

      <div className="flex flex-col gap-3">
        {!confirmarSalida ? (
          <button
            onClick={() => setConfirmarSalida(true)}
            className="presionable w-full py-3 rounded-control bg-danger/10 text-danger font-semibold text-sm"
          >
            Cerrar sesión
          </button>
        ) : (
          <>
            <button
              onClick={onSignOut}
              className="presionable w-full py-3 rounded-control bg-danger text-text font-semibold text-sm"
            >
              ¿Confirmar cierre de sesión?
            </button>
            <button
              onClick={() => setConfirmarSalida(false)}
              className="presionable text-textDim text-sm text-center hover:text-text"
            >
              Cancelar
            </button>
          </>
        )}
      </div>

      {/* Separado del cierre de sesión por su propia línea: son dos acciones
          de peso muy distinto y no deben leerse como una lista de opciones
          equivalentes. */}
      <div className="border-t border-perimetro mt-8 mb-6" />

      <button
        type="button"
        onClick={() => setBorrarCuenta(true)}
        className="presionable w-full py-2 rounded-control text-danger/70 text-xs hover:text-danger"
      >
        Borrar mi cuenta
      </button>

      <p className="text-textDim text-xs text-center mt-12 tracking-micro">Vorta v2.0</p>

      {borrarCuenta && email && (
        <DialogoBorrarCuenta
          email={email}
          onCerrar={() => setBorrarCuenta(false)}
          // Ya no hay cuenta: `onSignOut` es el que devuelve la app al login.
          onBorrada={onSignOut}
        />
      )}
    </div>
  )
}
