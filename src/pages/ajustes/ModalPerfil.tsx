import { useMemo, useState } from 'react'
import Aviso from '../../components/Aviso'
import Campo from '../../components/Campo'
import Hoja from '../../components/Hoja'
import { useSesion } from '../../context/sesion'
import { MONEDAS_SOPORTADAS, ZONA_GT, zonaValida } from '../../lib/constants'
import { supabase } from '../../lib/supabase'

interface Props {
  onCerrar: () => void
}

/**
 * Editar el perfil: nombre, moneda y zona horaria.
 *
 * **No existía ningún editor.** Las únicas escrituras a `profiles` eran el
 * onboarding (solo el nombre) y el tipo de cambio de Inversiones, así que
 * `moneda`, `locale` y `zona_horaria` quedaban con el default de la tabla —
 * GTQ, es-GT, America/Guatemala — para siempre. La Fase 1 hizo todo el trabajo
 * de parametrizar esos tres valores y nada los podía cambiar.
 *
 * El `locale` no se pregunta: es el formato de los números y las fechas, y sale
 * del navegador en el onboarding. Un selector de locale es una pregunta que
 * nadie sabe contestar ("¿es-GT o es-419?") para un efecto que casi no se ve.
 */
export default function ModalPerfil({ onCerrar }: Props) {
  const { userId, perfil, refrescar } = useSesion()
  const [nombre, setNombre] = useState(perfil.nombre ?? '')
  const [moneda, setMoneda] = useState(perfil.moneda)
  const [zona, setZona] = useState(perfil.zona_horaria)
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // `Intl.supportedValuesOf` no está en todos los motores; si falta, quedan las
  // de la región. Es un select nativo: en el teléfono lo dibuja el sistema, así
  // que una lista larga no es un problema de UI.
  const zonas = useMemo(() => {
    let lista: string[]
    try {
      lista = [...Intl.supportedValuesOf('timeZone')]
    } catch {
      lista = [ZONA_GT, 'America/Mexico_City', 'America/Bogota', 'America/Lima',
               'America/Costa_Rica', 'America/Tegucigalpa', 'America/Managua',
               'America/Panama', 'America/Santo_Domingo', 'America/Sao_Paulo',
               'Europe/Madrid', 'UTC']
    }
    // La zona guardada siempre está en la lista, aunque el motor no la conozca:
    // si no, el select la cambiaría sola al abrir la hoja.
    return lista.includes(zona) ? lista : [zona, ...lista]
  }, [zona])

  const cambioDeZona = zona !== perfil.zona_horaria

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return setErr('El nombre es requerido')
    // `hoyEn` lanza con una zona inválida, y de la zona salen los límites de
    // mes de todas las consultas: se valida antes de guardarla, no después.
    if (!zonaValida(zona)) return setErr(`La zona horaria "${zona}" no es válida`)

    setGuardando(true)
    setErr(null)
    const { error } = await supabase
      .from('profiles')
      .update({ nombre: nombre.trim(), moneda, zona_horaria: zona })
      .eq('user_id', userId)

    if (error) { setErr(error.message); setGuardando(false); return }

    setGuardando(false)
    onCerrar()
    await refrescar.perfil()
  }

  return (
    <Hoja titulo="Tu perfil" onCerrar={onCerrar}>
      <form onSubmit={guardar} className="space-y-3">
        <Campo
          etiqueta="Tu nombre" required autoComplete="name"
          value={nombre} onChange={e => setNombre(e.target.value)}
        />

        <Campo
          etiqueta="Moneda" tipo="select"
          value={moneda} onChange={e => setMoneda(e.target.value)}
          pista="Cambia cómo se muestran los montos. No convierte nada: lo guardado sigue siendo el mismo número."
        >
          {MONEDAS_SOPORTADAS.map(m => (
            <option key={m.codigo} value={m.codigo}>{m.codigo} — {m.nombre}</option>
          ))}
        </Campo>

        <Campo
          etiqueta="Zona horaria" tipo="select"
          value={zona} onChange={e => setZona(e.target.value)}
        >
          {zonas.map(z => <option key={z} value={z}>{z}</option>)}
        </Campo>

        {/* De la zona salen los límites de mes de TODAS las consultas, así que
            cambiarla mueve movimientos de un mes a otro. Se dice antes, no
            después de que los totales cambien solos. */}
        {cambioDeZona && (
          <Aviso tono="atencion">
            Cambiar la zona mueve qué movimientos caen en cada mes: los de los primeros y últimos
            días pueden pasar al mes vecino. No se pierde ni se modifica nada.
          </Aviso>
        )}

        {err && <Aviso>{err}</Aviso>}

        <button
          type="submit" disabled={guardando}
          className="presionable w-full bg-accent text-bg font-semibold h-12 rounded-full disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </form>
    </Hoja>
  )
}
