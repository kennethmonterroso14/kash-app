import { useEffect, useState } from 'react'
import Aviso from '../../components/Aviso'
import BotonConfirmar from '../../components/BotonConfirmar'
import Campo from '../../components/Campo'
import { useSesion } from '../../context/sesion'
import { supabase } from '../../lib/supabase'

interface Fila {
  id: string
  nombre_wallet: string
  cuenta_id: string | null
  tarjeta_id: string | null
}

/** El destino en un solo valor de <select>: 'c:<id>' cuenta, 't:<id>' tarjeta, '' sin asignar. */
const valorDestino = (f: Pick<Fila, 'cuenta_id' | 'tarjeta_id'>) =>
  f.cuenta_id ? `c:${f.cuenta_id}` : f.tarjeta_id ? `t:${f.tarjeta_id}` : ''
const columnasDestino = (valor: string) => ({
  cuenta_id: valor.startsWith('c:') ? valor.slice(2) : null,
  tarjeta_id: valor.startsWith('t:') ? valor.slice(2) : null,
})

/**
 * Cada tarjeta de Wallet → la cuenta (gasto) o la tarjeta de crédito (cargo en
 * su ciclo abierto) donde se registra. Una tarjeta que llega en un pago y no
 * está en la lista aparece sola, "sin asignar": ese pago no se registró.
 */
export default function SeccionTarjetasWallet() {
  const { userId, cuentas, tarjetas } = useSesion()
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [error, setError] = useState('')
  const [nombre, setNombre] = useState('')
  const [destino, setDestino] = useState('')
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let ignorar = false
    void supabase.from('atajo_tarjetas').select('id, nombre_wallet, cuenta_id, tarjeta_id')
      .eq('user_id', userId).order('created_at', { ascending: true })
      .then(({ data, error: e }) => {
        if (ignorar) return
        if (e) { setError('No se pudo cargar la lista de tarjetas.'); return }
        setFilas(data ?? [])
      })
    return () => { ignorar = true }
  }, [userId, recarga])

  const opciones = (
    <>
      <option value="">Sin asignar</option>
      {cuentas.length > 0 && (
        <optgroup label="Cuentas (gasto)">
          {cuentas.map(c => <option key={c.id} value={`c:${c.id}`}>{c.nombre}</option>)}
        </optgroup>
      )}
      {tarjetas.length > 0 && (
        <optgroup label="Tarjetas de crédito (cargo)">
          {tarjetas.map(t => <option key={t.id} value={`t:${t.id}`}>{t.nombre}</option>)}
        </optgroup>
      )}
    </>
  )

  const cambiar = async (id: string, valor: string) => {
    setError('')
    const { error: e } = await supabase.from('atajo_tarjetas').update(columnasDestino(valor)).eq('id', id).eq('user_id', userId)
    if (e) setError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.')
    setRecarga(n => n + 1)
  }

  const quitar = async (id: string) => {
    const { error: e } = await supabase.from('atajo_tarjetas').delete().eq('id', id).eq('user_id', userId)
    if (e) setError('No se pudo quitar. Revisa tu conexión e intenta de nuevo.')
    setRecarga(n => n + 1)
  }

  const agregar = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!nombre.trim()) return setError('Escribe el nombre de la tarjeta como aparece en Wallet')
    setError('')
    const { error: e } = await supabase.from('atajo_tarjetas')
      .insert({ user_id: userId, nombre_wallet: nombre.trim().slice(0, 80), ...columnasDestino(destino) })
    if (e) {
      setError(e.code === '23505' ? 'Esa tarjeta ya está en la lista.' : 'No se pudo agregar. Revisa tu conexión e intenta de nuevo.')
      return
    }
    setNombre('')
    setDestino('')
    setRecarga(n => n + 1)
  }

  return (
    <section aria-labelledby="wallet-titulo" className="vidrio-panel rounded-tarjeta p-4 mb-6">
      <h2 id="wallet-titulo" className="text-text text-[16px] font-semibold mb-1">2. Tus tarjetas de Wallet</h2>
      <p className="text-textDim text-[13px] mb-3">
        Escribe cada nombre exactamente como aparece en Wallet y elige adónde van sus pagos. Si llega un pago
        de una tarjeta que no está aquí, aparece sola para que la asignes (ese pago no se registra).
      </p>

      {filas === null && !error && <p className="text-textDim text-[14px] animate-pulse">Cargando…</p>}

      {filas && filas.length > 0 && (
        <ul className="mb-4">
          {filas.map(f => (
            <li key={f.id} className="py-2 border-t border-perimetro first:border-t-0">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-text text-[15px] truncate">{f.nombre_wallet}</span>
                <BotonConfirmar accion={`Quitar ${f.nombre_wallet}`} etiqueta="Quitar" onConfirmar={() => void quitar(f.id)} />
              </div>
              <Campo
                etiqueta={<span className="sr-only">Destino de {f.nombre_wallet}</span>}
                tipo="select"
                value={valorDestino(f)}
                onChange={e => void cambiar(f.id, e.target.value)}
              >
                {opciones}
              </Campo>
              {!f.cuenta_id && !f.tarjeta_id && (
                <p className="text-warning text-[13px] mt-1">Sin asignar: sus pagos no se registran.</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={agregar} className="space-y-2">
        <Campo etiqueta="Nombre en Wallet" placeholder="ej. Visa BI" value={nombre} onChange={e => setNombre(e.target.value)} />
        <Campo etiqueta="Va a" tipo="select" value={destino} onChange={e => setDestino(e.target.value)}>
          {opciones}
        </Campo>
        <button type="submit" className="presionable w-full h-11 rounded-full bg-accent/15 text-accent font-semibold">
          Agregar tarjeta
        </button>
      </form>

      {error && <Aviso clase="mt-3">{error}</Aviso>}
    </section>
  )
}
