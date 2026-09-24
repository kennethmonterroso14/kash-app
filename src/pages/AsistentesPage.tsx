import { useEffect, useState } from 'react'
import type { OAuthGrant } from '@supabase/supabase-js'
import Aviso from '../components/Aviso'
import BotonConfirmar from '../components/BotonConfirmar'
import Interruptor from '../components/Interruptor'
import TituloGrande from '../components/TituloGrande'
import { IconoCheck } from '../components/iconos'
import { useSesion } from '../context/sesion'
import { supabase } from '../lib/supabase'

const EJEMPLOS = [
  'Registra los movimientos de este estado de cuenta (adjunto el PDF) en BI Ahorros.',
  'Anota 45 de gasolina pagados en efectivo hoy.',
  '¿En qué gasté más en agosto comparado con julio?',
]

/**
 * Ajustes → Asistentes de IA: cómo conectar Claude, ChatGPT u otra IA al
 * conector MCP (`api/mcp`), y la lista de los que ya tienen acceso, con
 * "Desconectar". El acceso es un grant OAuth de Supabase Auth: revocarlo
 * invalida los tokens de ese asistente enseguida.
 *
 * "Permitir editar y borrar" es `profiles.ia_puede_editar`, y lo hace cumplir la
 * base (schema.sql, sección 4b), no solo el conector. Se lee y se escribe acá
 * y no en el provider: ninguna otra pantalla lo usa.
 */
export default function AsistentesPage() {
  const { userId } = useSesion()
  const url = `${window.location.origin}/api/mcp`
  // null = cargando; 'sin-migracion' = la base todavía no tiene la columna.
  const [permiso, setPermiso] = useState<boolean | null | 'sin-migracion'>(null)
  const [errorPermiso, setErrorPermiso] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [grants, setGrants] = useState<OAuthGrant[] | null>(null)
  const [error, setError] = useState('')
  const [quitando, setQuitando] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let ignorar = false
    void supabase.auth.oauth.listGrants().then(({ data, error: e }) => {
      if (ignorar) return
      if (e) {
        setError('No se pudo cargar la lista de asistentes conectados.')
        return
      }
      setError('')
      setGrants(data ?? [])
    })
    return () => { ignorar = true }
  }, [recarga])

  useEffect(() => {
    let ignorar = false
    void supabase.from('profiles').select('ia_puede_editar').eq('user_id', userId).maybeSingle()
      .then(({ data, error: e }) => {
        if (ignorar) return
        if (e) {
          if (/ia_puede_editar/.test(e.message)) setPermiso('sin-migracion')
          else setErrorPermiso('No se pudo leer este ajuste. Revisa tu conexión.')
          return
        }
        setPermiso(!!data?.ia_puede_editar)
      })
    return () => { ignorar = true }
  }, [userId])

  const cambiarPermiso = async (activo: boolean) => {
    const antes = permiso
    setPermiso(activo)
    setErrorPermiso('')
    const { error: e } = await supabase.from('profiles').update({ ia_puede_editar: activo }).eq('user_id', userId)
    if (e) {
      setPermiso(antes)
      setErrorPermiso('No se pudo guardar. Revisa tu conexión e intenta de nuevo.')
    }
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sin permiso de portapapeles: la URL queda seleccionable a la vista.
    }
  }

  const desconectar = async (clientId: string) => {
    setQuitando(clientId)
    const { error: e } = await supabase.auth.oauth.revokeGrant({ clientId })
    setQuitando(null)
    if (e) {
      setError('No se pudo desconectar. Revisa tu conexión e intenta de nuevo.')
      return
    }
    setRecarga(n => n + 1)
  }

  return (
    <div className="max-w-lg mx-auto px-4 pb-6">
      <TituloGrande
        titulo="Asistentes de IA"
        subtitulo="Registra y consulta tus finanzas desde tu IA"
        volver={{ a: '/ajustes', etiqueta: 'Ajustes' }}
      />

      <section aria-labelledby="url-titulo" className="vidrio-panel rounded-tarjeta p-4 mt-4 mb-6">
        <h2 id="url-titulo" className="text-text text-[16px] font-semibold mb-1">Tu conector</h2>
        <p className="text-textDim text-[13px] mb-3">
          En tu asistente, agrega un conector personalizado con esta dirección e inicia sesión con tu cuenta
          de Vorta cuando te lo pida.
        </p>
        <div className="flex items-center gap-2 bg-vidrio-relleno rounded-control pl-3 pr-1.5 py-1.5">
          <code className="flex-1 min-w-0 text-text text-[14px] truncate select-all font-sans">{url}</code>
          <button
            type="button"
            onClick={() => void copiar()}
            className="presionable h-9 px-4 rounded-full bg-accent text-bg text-[14px] font-semibold shrink-0 inline-flex items-center gap-1"
          >
            {copiado ? <><IconoCheck size={16} /> Copiado</> : 'Copiar'}
          </button>
        </div>

        <ul className="mt-4 space-y-2 text-[14px] text-text">
          <li>
            <span className="font-semibold">Claude:</span>{' '}
            <span className="text-textDim">Configuración → Conectores → Agregar conector personalizado.</span>
          </li>
          <li>
            <span className="font-semibold">ChatGPT:</span>{' '}
            <span className="text-textDim">Configuración → Apps y conectores, con el modo desarrollador activado → Crear.</span>
          </li>
          <li>
            <span className="font-semibold">Otras IA</span>{' '}
            <span className="text-textDim">que hablen MCP (Cursor, VS Code…): la misma dirección.</span>
          </li>
        </ul>
      </section>

      <section aria-labelledby="ejemplos-titulo" className="vidrio-panel rounded-tarjeta p-4 mb-6">
        <h2 id="ejemplos-titulo" className="text-text text-[16px] font-semibold mb-2">Pídele, por ejemplo</h2>
        <ul className="space-y-2">
          {EJEMPLOS.map(e => (
            <li key={e} className="text-textDim text-[14px] bg-vidrio-relleno rounded-control px-3 py-2">“{e}”</li>
          ))}
        </ul>
        <p className="text-textDim text-[13px] mt-3">
          Puede ver tus cuentas y movimientos, registrar ingresos, gastos y transferencias, crear cuentas y poner
          el saldo real de una cuenta. Importar el mismo estado dos veces no duplica movimientos.
        </p>
      </section>

      <section aria-labelledby="permiso-titulo" className="vidrio-panel rounded-tarjeta p-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 id="permiso-titulo" className="text-text text-[16px] font-semibold">Permitir editar y borrar</h2>
            <p className="text-textDim text-[13px] mt-0.5">
              Tus asistentes podrán corregir y borrar movimientos y cuentas. Apagado, solo leen y agregan.
            </p>
          </div>
          <Interruptor
            etiqueta="Permitir editar y borrar"
            activo={permiso === true}
            disabled={permiso === null || permiso === 'sin-migracion'}
            onCambiar={activo => void cambiarPermiso(activo)}
          />
        </div>
        <p className="text-textDim text-[13px] mt-3">
          Aun así, un asistente nunca puede cambiar tu perfil ni borrar tu cuenta de Vorta.
        </p>
        {permiso === 'sin-migracion' && (
          <Aviso tono="atencion" clase="mt-3">Este ajuste necesita una actualización de la base que todavía no se aplicó.</Aviso>
        )}
        {errorPermiso && <Aviso clase="mt-3">{errorPermiso}</Aviso>}
      </section>

      <section aria-labelledby="conectados-titulo" className="vidrio-panel rounded-tarjeta px-4 pt-4 pb-2">
        <h2 id="conectados-titulo" className="text-text text-[16px] font-semibold mb-1">Conectados</h2>
        {error && <Aviso clase="my-2">{error}</Aviso>}
        {!error && grants === null && <p className="text-textDim text-[14px] py-3 animate-pulse">Cargando…</p>}
        {grants?.length === 0 && (
          <p className="text-textDim text-[14px] py-3">Todavía no conectaste ningún asistente.</p>
        )}
        {grants && grants.length > 0 && (
          <ul>
            {grants.map(g => (
              <li key={g.client.id} className="flex items-center gap-3 min-h-[56px] py-2 border-t border-perimetro first:border-t-0">
                <div className="flex-1 min-w-0">
                  <p className="text-text text-[15px] truncate">{g.client.name || 'Asistente'}</p>
                  <p className="text-textDim text-[13px]">
                    Desde el {new Date(g.granted_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <BotonConfirmar
                  accion={`Desconectar ${g.client.name || 'el asistente'}`}
                  etiqueta={quitando === g.client.id ? 'Desconectando…' : 'Desconectar'}
                  disabled={quitando !== null}
                  onConfirmar={() => void desconectar(g.client.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
