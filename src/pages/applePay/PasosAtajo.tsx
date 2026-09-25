import { useState } from 'react'
import { IconoCheck } from '../../components/iconos'

const Paso = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex gap-3">
    <span aria-hidden="true" className="grid place-items-center w-6 h-6 rounded-full bg-accent/15 text-accent text-[13px] font-semibold shrink-0">{n}</span>
    <div className="flex-1 min-w-0 text-text text-[14px] space-y-1">{children}</div>
  </li>
)
const Dato = ({ children }: { children: React.ReactNode }) => (
  <span className="font-semibold">{children}</span>
)

/**
 * Cómo armar la automatización en Atajos. Los nombres van en español con el
 * inglés entre paréntesis: Atajos los traduce según el idioma del iPhone.
 */
export default function PasosAtajo() {
  const url = `${window.location.origin}/api/atajo`
  const [copiado, setCopiado] = useState(false)

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* la URL queda seleccionable */ }
  }

  return (
    <section aria-labelledby="pasos-titulo" className="vidrio-panel rounded-tarjeta p-4 mb-6">
      <h2 id="pasos-titulo" className="text-text text-[16px] font-semibold mb-3">3. La automatización en tu iPhone</h2>
      <ol className="space-y-4">
        <Paso n={1}>
          <p>Abre <Dato>Atajos</Dato> → <Dato>Automatización</Dato> → <Dato>+</Dato> → <Dato>Transacción</Dato> (Transaction).</p>
        </Paso>
        <Paso n={2}>
          <p>Elige tus tarjetas, deja todas las categorías y marca <Dato>Ejecutar inmediatamente</Dato> (Run Immediately). Luego <Dato>Nuevo atajo en blanco</Dato>.</p>
        </Paso>
        <Paso n={3}>
          <p>Agrega la acción <Dato>Obtener contenido de URL</Dato> (Get Contents of URL) con esta dirección:</p>
          <div className="flex items-center gap-2 bg-vidrio-relleno rounded-control pl-3 pr-1.5 py-1.5">
            <code className="flex-1 min-w-0 text-text text-[13px] truncate select-all font-sans">{url}</code>
            <button
              type="button"
              onClick={() => void copiar()}
              className="presionable h-8 px-3 rounded-full bg-accent text-bg text-[13px] font-semibold shrink-0 inline-flex items-center gap-1"
            >
              {copiado ? <><IconoCheck size={14} /> Copiada</> : 'Copiar'}
            </button>
          </div>
        </Paso>
        <Paso n={4}>
          <p>Toca <Dato>Mostrar más</Dato> (Show More). Método: <Dato>POST</Dato>. Cuerpo de la solicitud: <Dato>JSON</Dato>. Agrega cuatro campos de tipo texto:</p>
          <ul className="text-textDim space-y-0.5">
            <li><Dato>clave</Dato> → pega tu clave (paso 1)</li>
            <li><Dato>monto</Dato> → la variable <Dato>Importe</Dato> (Amount)</li>
            <li><Dato>comercio</Dato> → <Dato>Comercio</Dato> (Merchant)</li>
            <li><Dato>tarjeta</Dato> → <Dato>Tarjeta o pase</Dato> (Card or Pass)</li>
          </ul>
          <p className="text-textDim">Las variables aparecen arriba del teclado al tocar el valor de cada campo.</p>
        </Paso>
        <Paso n={5}>
          <p>Opcional: agrega <Dato>Mostrar notificación</Dato> (Show Notification) con el <Dato>Contenido de la URL</Dato> para ver lo que registró Vorta.</p>
        </Paso>
      </ol>
      <p className="text-textDim text-[13px] mt-4">
        Cada pago se registra al instante en la cuenta o tarjeta que asignaste, y al abrir Vorta te pide
        la categoría (con la del último pago en ese comercio ya marcada). Funciona con pagos de Apple Pay en
        tienda, con el iPhone o el Apple Watch; la tarjeta física y muchas compras en línea no disparan la
        automatización.
      </p>
    </section>
  )
}
