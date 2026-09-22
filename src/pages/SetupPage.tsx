import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import Aviso from '../components/Aviso'
import Campo from '../components/Campo'
import { crearCuentaConSaldo } from '../lib/altaCuenta'
import { hoyEn, MONEDAS_SOPORTADAS, zonaValida } from '../lib/constants'
import { toCentavos } from '../lib/finanzas'
import { supabase } from '../lib/supabase'
import { paletaDatos } from '../lib/tokens'

interface Props {
  user: User
  onComplete: () => void
}

const TIPOS = ['ahorro', 'corriente', 'efectivo', 'inversion', 'otro'] as const

/**
 * Lo que el navegador ya sabe del usuario. Se usa como **default**, no se
 * pregunta: acertar en silencio es mejor que una pantalla más, y equivocarse
 * acá es reversible desde Ajustes.
 *
 * `zona_horaria` tiene un `not null` con default 'America/Guatemala' en la
 * tabla, así que sin esto un usuario en México quedaba con el calendario de
 * Guatemala — y de la zona salen los límites de mes de TODAS las consultas.
 * Se valida con `zonaValida` porque una zona inválida hace que `hoyEn` lance.
 */
function delNavegador() {
  let zona = 'America/Guatemala'
  try {
    const detectada = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (detectada && zonaValida(detectada)) zona = detectada
  } catch { /* se queda el default */ }
  const locale = navigator.language || 'es-GT'
  return { zona, locale }
}

/**
 * Onboarding. Antes escribía solo la fila de `profiles`, así que un usuario
 * nuevo caía al dashboard **sin ninguna cuenta**, con todo en Q0.00 y sin saber
 * qué hacer (tarea 2.1).
 *
 * Dos pasos, no un formulario largo: el primero es quién sos, el segundo son
 * tus datos. Y el segundo viene **pre-llenado** con "Efectivo" en Q0, así que
 * se termina con un toque: no hace falta un "omitir" porque no hay nada que
 * omitir. La app sin una cuenta no puede mostrar nada, y con una en 0 ya puede.
 *
 * La moneda **sí** se pregunta. La zona y el idioma se sacan del navegador
 * porque se aciertan casi siempre; en qué moneda guardás tu dinero no se deduce
 * del idioma del teléfono, y equivocarse ahí se ve en cada pantalla.
 */
export default function SetupPage({ user, onComplete }: Props) {
  const [paso, setPaso] = useState<1 | 2>(1)
  const [nombre, setNombre] = useState(user.email?.split('@')[0] ?? '')
  const [moneda, setMoneda] = useState('GTQ')
  const [cuentaNombre, setCuentaNombre] = useState('Efectivo')
  const [cuentaTipo, setCuentaTipo] = useState<(typeof TIPOS)[number]>('efectivo')
  const [saldo, setSaldo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Si ya existe un perfil, precargar lo guardado. El prefijo del email es solo
  // el default del primer ingreso; sin esto, volver a enviar el formulario
  // sobrescribía el nombre y la moneda reales del usuario.
  useEffect(() => {
    let ignore = false
    supabase
      .from('profiles')
      .select('nombre, moneda')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (ignore || !data) return
        if (data.nombre) setNombre(data.nombre)
        if (data.moneda) setMoneda(data.moneda)
      })
    return () => { ignore = true }
  }, [user.id])

  // El default del nombre es el prefijo del correo, que viene en minúscula:
  // saludar con "kenneth" se lee como un descuido, no como informalidad.
  const pila = nombre.trim().split(' ')[0]
  const primerNombre = pila ? pila[0].toUpperCase() + pila.slice(1) : ''

  const irAlPaso2 = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return
    setError('')
    setPaso(2)
  }

  const terminar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cuentaNombre.trim()) return setError('Ponle un nombre a la cuenta')

    // Dejar el saldo en blanco significa Q0.00, no "no hacer nada".
    const saldoQ = saldo.trim() === '' ? 0 : parseFloat(saldo)
    if (!Number.isFinite(saldoQ) || saldoQ < 0) {
      return setError('Ingresa un saldo válido (0 o mayor)')
    }

    setLoading(true)
    setError('')

    const { zona, locale } = delNavegador()
    const { error: errPerfil } = await supabase.from('profiles').upsert({
      user_id: user.id,
      nombre: nombre.trim(),
      moneda,
      locale,
      zona_horaria: zona,
    }, { onConflict: 'user_id' })

    if (errPerfil) {
      setError(errPerfil.message)
      setLoading(false)
      return
    }

    // La cuenta va DESPUÉS del perfil: la fecha del ajuste sale de la zona que
    // se acabó de guardar, y `hoyEn` la necesita válida.
    const fallo = await crearCuentaConSaldo({
      userId: user.id,
      nombre: cuentaNombre,
      tipo: cuentaTipo,
      color: paletaDatos[0],
      saldoCentavos: toCentavos(saldoQ),
      hoy: hoyEn(zona),
    })

    if (fallo) {
      // El perfil YA quedó guardado, así que la app puede arrancar igual: se
      // dice qué falló y se deja seguir, en lugar de bloquear el ingreso por
      // una cuenta que se puede crear después desde Patrimonio.
      setError(`Tu perfil se guardó, pero la cuenta no: ${fallo}`)
      setLoading(false)
      return
    }

    onComplete()
  }

  return (
    <div className="min-h-dvh bg-bg flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-accent font-display">Vorta</h1>
          <p className="text-textDim text-sm mt-1">
            {paso === 1 ? 'Bienvenido' : `Un paso más, ${primerNombre}`}
          </p>
        </div>

        <div className="bg-surface rounded-tarjeta p-6">
          {paso === 1 ? (
            <>
              <h2 className="text-text font-semibold mb-1 tracking-titulo">¿Cómo te llamamos?</h2>
              <p className="text-textDim text-sm mb-5">
                Y en qué moneda llevás tus cuentas.
              </p>

              <form onSubmit={irAlPaso2} className="space-y-4">
                <Campo
                  etiqueta="Tu nombre" required autoComplete="name" placeholder="Kenneth"
                  value={nombre} onChange={e => setNombre(e.target.value)}
                />
                <Campo
                  etiqueta="Moneda" tipo="select"
                  value={moneda} onChange={e => setMoneda(e.target.value)}
                  pista="Se puede cambiar después en Ajustes."
                >
                  {MONEDAS_SOPORTADAS.map(m => (
                    <option key={m.codigo} value={m.codigo}>{m.codigo} — {m.nombre}</option>
                  ))}
                </Campo>

                {error && <Aviso>{error}</Aviso>}

                <button
                  type="submit"
                  className="presionable w-full bg-accent text-bg font-semibold py-3 rounded-control"
                >
                  Continuar
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-text font-semibold mb-1 tracking-titulo">Tu primera cuenta</h2>
              <p className="text-textDim text-sm mb-5">
                Sin una cuenta no hay dónde registrar un movimiento. Podés dejarla en 0 y ajustarla
                cuando quieras.
              </p>

              <form onSubmit={terminar} className="space-y-4">
                <Campo
                  etiqueta="Nombre de la cuenta" required placeholder="ej. Efectivo, BI Ahorros"
                  value={cuentaNombre} onChange={e => setCuentaNombre(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Campo
                    etiqueta="Tipo" tipo="select" value={cuentaTipo}
                    onChange={e => setCuentaTipo(e.target.value as (typeof TIPOS)[number])}
                  >
                    {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                  </Campo>
                  <Campo
                    etiqueta="Saldo actual" tipo="number" step="0.01" min="0" placeholder="0.00"
                    value={saldo} onChange={e => setSaldo(e.target.value)}
                    clase="tabular-nums"
                  />
                </div>

                {error && <Aviso>{error}</Aviso>}

                <button
                  type="submit"
                  disabled={loading}
                  className="presionable w-full bg-accent text-bg font-semibold py-3 rounded-control disabled:opacity-50"
                >
                  {loading ? 'Creando...' : 'Empezar'}
                </button>
                <button
                  type="button"
                  onClick={() => { setError(''); setPaso(1) }}
                  disabled={loading}
                  className="presionable w-full text-textDim text-sm hover:text-text disabled:opacity-50"
                >
                  ‹ Volver
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
