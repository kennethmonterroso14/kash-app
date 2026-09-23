import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Aviso from '../components/Aviso'
import TituloGrande from '../components/TituloGrande'
import { IconoChevron, IconoEtiqueta, IconoRepetir } from '../components/iconos'
import { useSesion } from '../context/sesion'
import DialogoBorrarCuenta from './ajustes/DialogoBorrarCuenta'
import ModalPerfil from './ajustes/ModalPerfil'

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
  const [editarPerfil, setEditarPerfil] = useState(false)
  // Sin consulta propia: el perfil ya viene del contexto.
  const { perfil, email, error: errores } = useSesion()
  const nombre = perfil.nombre
  const errorPerfil = errores.perfil ? 'No se pudo cargar tu perfil' : null

  const inicial = (email ?? 'U')[0].toUpperCase()
  const nombreVisible = nombre ?? email ?? 'Usuario'

  const AJUSTES = [
    { to: '/ajustes/pagos',      Icono: IconoRepetir,  label: 'Pagos Fijos',
      detalle: 'Se aplican solos cada mes' },
    { to: '/ajustes/categorias', Icono: IconoEtiqueta, label: 'Categorías',
      detalle: 'Las tuyas, además de las base' },
  ]

  return (
    <div className="max-w-lg mx-auto px-4 pb-6">
      <TituloGrande titulo="Ajustes" />
      <div className="flex flex-col items-center gap-3 mt-6 mb-8">
        <div className="w-16 h-16 rounded-full vidrio-panel flex items-center justify-center">
          <span className="text-accent text-2xl font-bold">{inicial}</span>
        </div>
        <div className="text-center">
          <p className="text-text font-semibold text-lg tracking-titulo">{nombreVisible}</p>
          {nombre && email && <p className="text-textDim text-sm mt-0.5">{email}</p>}
          {errorPerfil && <Aviso clase="mt-1">{errorPerfil}</Aviso>}
          {/* Editar el perfil cuelga de la identidad, no de la lista de
              ajustes: es sobre quién sos, no sobre cómo se comporta la app. */}
          <button
            type="button"
            onClick={() => setEditarPerfil(true)}
            className="presionable text-accent text-xs mt-2 hover:opacity-80 tracking-micro"
          >
            Editar perfil
          </button>
        </div>
      </div>


      {/* Una lista agrupada, como Ajustes de iOS: filas en una sola tarjeta,
          separadas por un filete, con el icono en su cuadradito de color. */}
      <ul className="vidrio-panel rounded-tarjeta px-4 mb-6">
        {AJUSTES.map(({ to, Icono, label, detalle }) => (
          <li key={to} className="border-t border-perimetro first:border-t-0">
            <button
              onClick={() => navigate(to)}
              className="presionable w-full flex items-center gap-3 min-h-[60px] py-2 text-left"
            >
              <span aria-hidden="true" className="grid place-items-center w-8 h-8 rounded-[9px] bg-accent text-bg flex-shrink-0">
                <Icono size={18} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-text text-[16px]">{label}</span>
                <span className="block text-textDim text-[13px] truncate">{detalle}</span>
              </span>
              <IconoChevron direccion="der" size={16} className="text-textDim flex-shrink-0" />
            </button>
          </li>
        ))}
      </ul>


      <div className="flex flex-col gap-3">
        {!confirmarSalida ? (
          <button
            onClick={() => setConfirmarSalida(true)}
            className="presionable w-full h-12 rounded-full bg-danger/10 text-danger font-semibold text-sm"
          >
            Cerrar sesión
          </button>
        ) : (
          <>
            <button
              onClick={onSignOut}
              className="presionable w-full h-12 rounded-full bg-danger text-text font-semibold text-sm"
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

      <div className="mt-8 mb-5" />

      {/* Requisito de las dos tiendas: accesibles DESDE la app, no solo un
          enlace en la ficha de la tienda. */}
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => navigate('/ajustes/privacidad')}
          className="presionable text-textDim text-xs hover:text-text tracking-micro"
        >
          Privacidad
        </button>
        <span aria-hidden="true" className="text-textDim/40 text-xs">·</span>
        <button
          type="button"
          onClick={() => navigate('/ajustes/terminos')}
          className="presionable text-textDim text-xs hover:text-text tracking-micro"
        >
          Términos
        </button>
      </div>

      {/* Separado del cierre de sesión por su propia línea: son dos acciones
          de peso muy distinto y no deben leerse como una lista de opciones
          equivalentes. */}
      <div className="mt-5 mb-6" />

      <button
        type="button"
        onClick={() => setBorrarCuenta(true)}
        className="presionable w-full py-2 rounded-control text-danger/70 text-xs hover:text-danger"
      >
        Borrar mi cuenta
      </button>

      <p className="text-textDim text-xs text-center mt-12 tracking-micro">Vorta v2.0</p>

      {editarPerfil && <ModalPerfil onCerrar={() => setEditarPerfil(false)} />}

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
