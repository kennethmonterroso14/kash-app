import { useState } from 'react'
import Aviso from '../../components/Aviso'
import Campo from '../../components/Campo'
import Dialogo from '../../components/Dialogo'
import { supabase } from '../../lib/supabase'

interface Props {
  /** El correo de la sesión: hay que escribirlo para confirmar. */
  email: string
  onCerrar: () => void
  /** Se llama cuando la cuenta ya no existe. */
  onBorrada: () => void
}

/**
 * Borrar la cuenta. Requisito duro de App Store: toda app que permita crear una
 * cuenta tiene que permitir borrarla **desde la app**, no solo desactivarla.
 *
 * **No usa el patrón de dos toques del repo.** Dos toques está bien para una
 * fila; esto borra todo y es irreversible, así que pide escribir el correo. Es
 * la barrera que corresponde al tamaño de la acción, y es la que las dos
 * tiendas esperan ver.
 *
 * Lo hace el RPC `borrar_mi_cuenta()`, que borra en orden de dependencia y
 * apaga el trigger de deuda mientras lo hace — ver el comentario de la función
 * en `supabase/schema.sql`. El cliente no puede tocar `auth.users`, así que
 * esto no se puede armar con consultas sueltas.
 *
 * Se enumera QUÉ se va a borrar. Un "esto es irreversible" genérico no informa
 * nada; nombrar las nueve cosas sí.
 */
export default function DialogoBorrarCuenta({ email, onCerrar, onBorrada }: Props) {
  const [escrito, setEscrito] = useState('')
  const [borrando, setBorrando] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const coincide = escrito.trim().toLowerCase() === email.toLowerCase()

  const borrar = async () => {
    if (!coincide) return
    setBorrando(true)
    setErr(null)
    const { error } = await supabase.rpc('borrar_mi_cuenta')
    if (error) {
      setErr(`No se pudo borrar la cuenta: ${error.message}`)
      setBorrando(false)
      return
    }
    // La sesión apunta a un usuario que ya no existe: se cierra acá y no se
    // espera a que un token huérfano haga fallar una consulta cualquiera.
    await supabase.auth.signOut()
    onBorrada()
  }

  return (
    <Dialogo titulo="¿Borrar tu cuenta?" onCerrar={onCerrar}>
      <p className="text-textDim text-sm mb-3">
        Se borra <span className="text-text">todo</span> y no se puede deshacer: tus cuentas y sus
        saldos, tus movimientos, tarjetas y ciclos, presupuestos, metas, pagos fijos, categorías
        propias e inversiones con su historial.
      </p>
      <p className="text-textDim text-sm mb-4">
        Si lo que querés es dejar de usar la app un rato, cerrar sesión alcanza.
      </p>

      <div className="mb-4">
        <Campo
          etiqueta="Escribí tu correo para confirmar"
          tipo="email"
          autoComplete="off"
          placeholder={email}
          value={escrito}
          onChange={e => setEscrito(e.target.value)}
          pista={escrito.trim() !== '' && !coincide ? 'Todavía no coincide' : undefined}
        />
      </div>

      {err && <div className="mb-3"><Aviso>{err}</Aviso></div>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCerrar}
          disabled={borrando}
          className="presionable flex-1 py-3 rounded-control bg-bg text-textDim text-sm font-semibold hover:text-text disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void borrar()}
          disabled={!coincide || borrando}
          className="presionable flex-1 py-3 rounded-control bg-danger text-text text-sm font-semibold disabled:opacity-50"
        >
          {borrando ? 'Borrando...' : 'Borrar cuenta'}
        </button>
      </div>
    </Dialogo>
  )
}
