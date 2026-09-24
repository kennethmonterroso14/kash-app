import { useCallback, useState } from 'react'
import Aviso from '../components/Aviso'
import TituloGrande from '../components/TituloGrande'
import PasosAtajo from './applePay/PasosAtajo'
import SeccionClave from './applePay/SeccionClave'
import SeccionTarjetasWallet from './applePay/SeccionTarjetasWallet'

/**
 * Ajustes → Apple Pay: cada pago con Apple Pay se registra solo, vía la
 * automatización "Transacción" de Atajos que hace un POST a /api/atajo
 * (docs/APPLE_PAY.md). Tres pasos: la clave, las tarjetas de Wallet y el atajo.
 */
export default function ApplePayPage() {
  const [sinMigracion, setSinMigracion] = useState(false)
  const marcarSinMigracion = useCallback(() => setSinMigracion(true), [])

  return (
    <div className="max-w-lg mx-auto px-4 pb-6">
      <TituloGrande
        titulo="Apple Pay"
        subtitulo="Tus pagos se registran solos"
        volver={{ a: '/ajustes', etiqueta: 'Ajustes' }}
      />
      <div className="mt-4">
        {sinMigracion ? (
          <Aviso tono="atencion">Esta función necesita una actualización de la base que todavía no se aplicó.</Aviso>
        ) : (
          <>
            <SeccionClave onSinMigracion={marcarSinMigracion} />
            <SeccionTarjetasWallet />
            <PasosAtajo />
          </>
        )}
      </div>
    </div>
  )
}
