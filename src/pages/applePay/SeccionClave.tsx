import { useEffect, useState } from 'react'
import Aviso from '../../components/Aviso'
import BotonConfirmar from '../../components/BotonConfirmar'
import { IconoCheck } from '../../components/iconos'
import { useSesion } from '../../context/sesion'
import { generarClaveAtajo, hashClaveAtajo } from '../../lib/claveAtajo'
import { supabase } from '../../lib/supabase'

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

interface Props {
  /** La base no tiene las tablas del atajo: la página muestra el aviso y nada más. */
  onSinMigracion: () => void
}

/**
 * La clave personal del atajo. Se genera en el navegador, se muestra UNA vez
 * para copiarla y en la base queda solo su SHA-256 (ver lib/claveAtajo.ts).
 * Generar otra pisa el hash: la anterior deja de servir en ese momento.
 */
export default function SeccionClave({ onSinMigracion }: Props) {
  const { userId } = useSesion()
  const [estado, setEstado] = useState<{ creada_at: string; ultimo_uso: string | null } | null | undefined>(undefined)
  const [nueva, setNueva] = useState<string | null>(null)
  const [copiada, setCopiada] = useState(false)
  const [error, setError] = useState('')
  const [generando, setGenerando] = useState(false)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let ignorar = false
    void supabase.from('atajo_claves').select('creada_at, ultimo_uso').eq('user_id', userId).maybeSingle()
      .then(({ data, error: e }) => {
        if (ignorar) return
        if (e) {
          if (/atajo_claves/.test(e.message)) onSinMigracion()
          else setError('No se pudo leer tu clave. Revisa tu conexión.')
          return
        }
        setEstado(data)
      })
    return () => { ignorar = true }
  }, [userId, recarga, onSinMigracion])

  const generar = async () => {
    setGenerando(true)
    setError('')
    const clave = generarClaveAtajo()
    const { error: e } = await supabase.from('atajo_claves').upsert(
      { user_id: userId, clave_hash: await hashClaveAtajo(clave), creada_at: new Date().toISOString(), ultimo_uso: null },
      { onConflict: 'user_id' },
    )
    setGenerando(false)
    if (e) {
      setError('No se pudo crear la clave. Revisa tu conexión e intenta de nuevo.')
      return
    }
    setNueva(clave)
    setCopiada(false)
    setRecarga(n => n + 1)
  }

  const copiar = async () => {
    if (!nueva) return
    try {
      await navigator.clipboard.writeText(nueva)
      setCopiada(true)
    } catch { /* queda seleccionable a la vista */ }
  }

  return (
    <section aria-labelledby="clave-titulo" className="vidrio-panel rounded-tarjeta p-4 mb-6">
      <h2 id="clave-titulo" className="text-text text-[16px] font-semibold mb-1">1. Tu clave</h2>
      <p className="text-textDim text-[13px] mb-3">
        Identifica tu atajo. Solo sirve para registrar pagos: no permite ver ni borrar nada.
      </p>

      {nueva && (
        <div className="bg-vidrio-relleno rounded-control p-3 mb-3">
          <p className="text-warning text-[13px] font-semibold mb-2">Cópiala ahora: no se vuelve a mostrar.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 text-text text-[13px] break-all select-all font-sans">{nueva}</code>
            <button
              type="button"
              onClick={() => void copiar()}
              className="presionable h-9 px-4 rounded-full bg-accent text-bg text-[14px] font-semibold shrink-0 inline-flex items-center gap-1"
            >
              {copiada ? <><IconoCheck size={16} /> Copiada</> : 'Copiar'}
            </button>
          </div>
        </div>
      )}

      {estado === undefined && !error && <p className="text-textDim text-[14px] animate-pulse">Cargando…</p>}

      {estado === null && !nueva && (
        <button
          type="button"
          onClick={() => void generar()}
          disabled={generando}
          className="presionable w-full h-11 rounded-full bg-accent text-bg font-semibold disabled:opacity-50"
        >
          {generando ? 'Creando…' : 'Crear mi clave'}
        </button>
      )}

      {estado && (
        <>
          <p className="text-text text-[14px]">
            Creada el {fechaHora(estado.creada_at)}
            <span className="text-textDim"> · {estado.ultimo_uso ? `último pago recibido el ${fechaHora(estado.ultimo_uso)}` : 'todavía no llega ningún pago'}</span>
          </p>
          <BotonConfirmar
            variante="bloque"
            accion="Generar una clave nueva"
            etiqueta={generando ? 'Creando…' : 'Generar una clave nueva'}
            etiquetaArmada="La actual deja de funcionar. Toca otra vez"
            disabled={generando}
            onConfirmar={() => void generar()}
          />
        </>
      )}

      {error && <Aviso clase="mt-3">{error}</Aviso>}
    </section>
  )
}
