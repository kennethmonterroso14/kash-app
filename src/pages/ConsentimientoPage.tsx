import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js'
import Aviso from '../components/Aviso'
import { IconoCheck, IconoCerrar } from '../components/iconos'
import { supabase } from '../lib/supabase'

const PUEDE = [
  'Ver tus cuentas, saldos, categorías y movimientos',
  'Registrar ingresos, gastos y transferencias',
  'Crear cuentas y poner el saldo real de una cuenta',
]
// Esto lo hace cumplir la BASE (schema.sql, sección 4b) para cualquier token de
// asistente, no solo el conector: por eso se puede decir "no podrá".
const NO_PODRA = [
  'Editar ni borrar nada, salvo que lo actives en Ajustes → Asistentes de IA',
  'Cambiar tu perfil ni borrar tu cuenta de Vorta',
  'Ver tu contraseña',
]

/** El host de una URL, o la URL tal cual si no se puede leer. */
function host(url: string): string {
  try { return new URL(url).host } catch { return url }
}

/**
 * Consentimiento OAuth: una IA (Claude, ChatGPT…) pide conectarse a Vorta.
 * Supabase Auth manda acá con `?authorization_id=…` después de que la persona
 * inició sesión; lo que se aprueba es un token para el conector MCP (`api/mcp`).
 *
 * El nombre del cliente lo elige quien lo registra (el registro es dinámico),
 * así que no prueba nada: por eso se muestra también ADÓNDE devuelve, que es lo
 * que no se puede falsificar, y la aprobación siempre es explícita.
 *
 * Va fuera del `Layout`: es una pantalla de paso, sin la barra de navegación.
 */
export default function ConsentimientoPage() {
  const [params] = useSearchParams()
  const id = params.get('authorization_id')
  const [detalles, setDetalles] = useState<OAuthAuthorizationDetails | null>(null)
  const [error, setError] = useState(id ? '' : 'Falta el identificador de la solicitud. Vuelve a conectar desde tu asistente.')
  const [enviando, setEnviando] = useState<'permitir' | 'cancelar' | 'volviendo' | null>(null)

  useEffect(() => {
    if (!id) return
    let ignorar = false
    void supabase.auth.oauth.getAuthorizationDetails(id).then(({ data, error: e }) => {
      if (ignorar) return
      if (e || !data) {
        setError('Esta solicitud ya no es válida o venció. Vuelve a conectar desde tu asistente.')
        return
      }
      // Ya lo había autorizado antes: Supabase devuelve directo adónde ir.
      if (!('authorization_id' in data)) {
        setEnviando('volviendo')
        window.location.assign(data.redirect_url)
        return
      }
      setDetalles(data)
    })
    return () => { ignorar = true }
  }, [id])

  const decidir = async (permitir: boolean) => {
    if (!id) return
    setEnviando(permitir ? 'permitir' : 'cancelar')
    setError('')
    const opciones = { skipBrowserRedirect: true }
    const { data, error: e } = permitir
      ? await supabase.auth.oauth.approveAuthorization(id, opciones)
      : await supabase.auth.oauth.denyAuthorization(id, opciones)
    if (e || !data) {
      setError('No se pudo completar. Revisa tu conexión e intenta de nuevo.')
      setEnviando(null)
      return
    }
    window.location.assign(data.redirect_url)
  }

  const cliente = detalles?.client.name || 'Un asistente'

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-10">
      <main className="w-full max-w-sm">
        <p className="text-center text-accent font-display font-bold text-2xl mb-6">Vorta</p>

        <div className="vidrio-panel rounded-tarjeta p-6">
          {!detalles && !error && (
            <p className="text-textDim text-sm text-center animate-pulse">
              {enviando === 'volviendo' ? 'Volviendo a tu asistente…' : 'Cargando la solicitud…'}
            </p>
          )}

          {detalles && (
            <>
              <div className="flex flex-col items-center text-center gap-3 mb-5">
                {detalles.client.logo_uri && (
                  <img src={detalles.client.logo_uri} alt="" className="w-14 h-14 rounded-panel object-cover" />
                )}
                <h1 className="text-text font-display font-bold text-[24px] leading-tight tracking-titulo">
                  Conectar {cliente}
                </h1>
                <p className="text-textDim text-[15px]">
                  {cliente} quiere usar tu cuenta de Vorta
                  {detalles.user.email && <> (<span className="text-text">{detalles.user.email}</span>)</>}.
                </p>
              </div>

              <p className="text-text text-[15px] font-semibold mb-2">Podrá</p>
              <ul className="space-y-2 mb-4">
                {PUEDE.map(t => (
                  <li key={t} className="flex gap-2.5 text-[15px] text-text">
                    <IconoCheck size={18} className="text-success shrink-0 mt-0.5" />{t}
                  </li>
                ))}
              </ul>
              <p className="text-text text-[15px] font-semibold mb-2">No podrá</p>
              <ul className="space-y-2 mb-5">
                {NO_PODRA.map(t => (
                  <li key={t} className="flex gap-2.5 text-[15px] text-textDim">
                    <IconoCerrar size={18} className="shrink-0 mt-0.5" />{t}
                  </li>
                ))}
              </ul>

              <p className="text-textDim text-[13px] mb-5">
                Al permitir vuelves a <span className="text-text font-semibold">{host(detalles.redirect_uri)}</span>.
                Autoriza solo asistentes en los que confíes: tendrán acceso a tus datos de Vorta. Puedes
                desconectarlos cuando quieras en Ajustes → Asistentes de IA.
              </p>
            </>
          )}

          {error && <Aviso clase="mb-4">{error}</Aviso>}

          {detalles && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void decidir(true)}
                disabled={enviando !== null}
                className="presionable w-full h-12 rounded-full bg-accent text-bg font-semibold disabled:opacity-50"
              >
                {enviando === 'permitir' ? 'Conectando…' : 'Permitir'}
              </button>
              <button
                type="button"
                onClick={() => void decidir(false)}
                disabled={enviando !== null}
                className="presionable w-full h-12 rounded-full bg-vidrio-relleno text-text font-semibold disabled:opacity-50"
              >
                {enviando === 'cancelar' ? 'Cancelando…' : 'Cancelar'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
