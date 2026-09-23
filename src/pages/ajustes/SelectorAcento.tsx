import { useId, useState, useSyncExternalStore } from 'react'
import { supabase } from '../../lib/supabase'
import { acentos } from '../../lib/tokens'
import { acentoActual, aplicarAcento, suscribirAcento } from '../../lib/acento'
import { useEsClaro } from '../../hooks/useColores'
import { useSesion } from '../../context/sesion'
import { IconoCheck } from '../../components/iconos'

/**
 * El color de acento, como el de Ajustes de macOS: ocho círculos, el elegido
 * con su anillo. Se aplica al instante (en este dispositivo) y después se
 * guarda en el perfil para que lo sigan los otros dispositivos.
 *
 * Si la base todavía no tiene la columna `profiles.acento`, el cambio queda
 * solo en este dispositivo y se dice — no se finge que se sincronizó.
 */
export default function SelectorAcento() {
  const { userId } = useSesion()
  const claro = useEsClaro()
  const nombre = useId()
  const actual = useSyncExternalStore(suscribirAcento, acentoActual, () => 'morado')
  const [nota, setNota] = useState('')

  const elegir = async (id: string) => {
    aplicarAcento(id)
    setNota('')
    const { error } = await supabase.from('profiles').update({ acento: id }).eq('user_id', userId)
    if (error) {
      setNota(/acento/.test(error.message)
        ? 'Guardado en este dispositivo. Para que se sincronice con tus otros dispositivos falta una actualización de la base.'
        : 'Se aplicó en este dispositivo, pero no se pudo guardar en tu cuenta. Revisa tu conexión.')
    }
  }

  const elegido = acentos.find(a => a.id === actual)

  return (
    <section aria-labelledby="acento-titulo" className="vidrio-panel rounded-tarjeta p-4 mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 id="acento-titulo" className="text-text text-[16px]">Color de acento</h2>
        <span className="text-textDim text-[13px]">{elegido?.nombre}</span>
      </div>
      <fieldset className="min-w-0">
        <legend className="sr-only">Color de acento</legend>
        <div className="grid grid-cols-8 gap-1.5">
          {acentos.map(a => {
            const color = claro ? a.claro.accent : a.oscuro.accent
            const activo = a.id === actual
            return (
              <label key={a.id} className="presionable grid place-items-center cursor-pointer">
                <input
                  type="radio" name={nombre} value={a.id} checked={activo}
                  onChange={() => void elegir(a.id)}
                  aria-label={a.nombre}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`grid place-items-center w-full max-w-9 aspect-square rounded-full ring-2 ring-offset-2 ring-offset-transparent transition-shadow duration-rapida peer-focus-visible:ring-text ${
                    activo ? 'ring-text/80' : 'ring-transparent'
                  }`}
                  style={{ background: color }}
                >
                  {activo && <IconoCheck size={16} className="text-bg" />}
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>
      {nota && <p className="text-textDim text-[12px] mt-3">{nota}</p>}
    </section>
  )
}
