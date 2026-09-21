import { useMemo, useState } from 'react'
import { useTransacciones } from '../hooks/useTransacciones'
import { useResumen6Meses } from '../hooks/useResumen6Meses'
import { useInversiones } from '../hooks/useInversiones'
import { calcEstadisticasMes, calcDisponibleReal, calcPatrimonioNeto } from '../lib/finanzas'
import { MESES } from '../lib/constants'
import { useSesion } from '../context/sesion'
import { useFechas } from '../hooks/useFechas'
import SelectorMes from '../components/SelectorMes'
import TarjetaPatrimonio from './dashboard/TarjetaPatrimonio'
import TarjetaDisponibleReal from './dashboard/TarjetaDisponibleReal'
import TarjetasTC from './dashboard/TarjetasTC'
import TarjetaPatrimonioNeto from './dashboard/TarjetaPatrimonioNeto'
import StatsMes from './dashboard/StatsMes'
import GraficaCategorias from './dashboard/GraficaCategorias'
import Grafica6Meses from './dashboard/Grafica6Meses'

export default function DashboardPage() {
  const {
    userId, coloresCategorias, cuentas, totalPatrimonio, resumenTCs, tarjetas,
    perfil, error: errores,
  } = useSesion()
  const fechas = useFechas()
  const [mes, setMes] = useState(fechas.mesActual())
  const [oculto, setOculto] = useState(false)

  const { txns, loading, error: errorTxns } = useTransacciones(userId, mes)
  const { data: resumen6 } = useResumen6Meses(userId)
  const { resumen: resumenInv, error: errorInv } = useInversiones(userId)
  const errorCuentas = errores.cuentas

  const stats = useMemo(() => calcEstadisticasMes(txns), [txns])
  const disponibleReal = useMemo(
    // La moneda va a la advertencia, que cita un monto.
    () => calcDisponibleReal(totalPatrimonio, tarjetas, { moneda: perfil.moneda, locale: perfil.locale }),
    [totalPatrimonio, tarjetas, perfil.moneda, perfil.locale],
  )
  const patrimonioNeto = useMemo(
    () => calcPatrimonioNeto(totalPatrimonio, resumenInv.valor_total, tarjetas),
    [totalPatrimonio, resumenInv.valor_total, tarjetas],
  )

  const [anio, mesNum] = mes.split('-').map(Number)
  const etiquetaMes = `${MESES[mesNum - 1]} ${anio}`

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <TarjetaPatrimonio
        total={totalPatrimonio}
        cuentas={cuentas}
        error={errorCuentas}
        oculto={oculto}
        onAlternar={() => setOculto(v => !v)}
      />

      {/*
        Las cifras derivadas se SUPRIMEN si las cuentas no cargaron: con un
        saldo 0 fantasma, calcDisponibleReal inventa una insolvencia y
        calcPatrimonioNeto un neto negativo. Era una clase entera de bug.
      */}
      {tarjetas.length > 0 && !errorCuentas && (
        <TarjetaDisponibleReal datos={disponibleReal} oculto={oculto} />
      )}

      {resumenTCs.length > 0 && <TarjetasTC resumenTCs={resumenTCs} />}

      {(resumenInv.capital_total > 0 || tarjetas.length > 0) && !errorCuentas && !errorInv && (
        <TarjetaPatrimonioNeto
          datos={patrimonioNeto}
          saldoCuentas={totalPatrimonio}
          valorInversiones={resumenInv.valor_total}
          oculto={oculto}
        />
      )}

      <div className="flex items-center justify-center">
        <SelectorMes mes={mes} onCambiar={setMes} />
      </div>

      {/* Un fetch fallido no se pinta como "sin movimientos": las cifras del
          mes quedarían en Q0.00, que afirma que no hubo movimiento en lugar de
          que no se pudo saber. */}
      {errorTxns ? (
        <div role="alert" className="text-danger text-sm bg-danger/10 rounded-control px-4 py-3">
          No se pudieron cargar los movimientos de {etiquetaMes}, así que las cifras del mes no se
          pueden mostrar. {errorTxns}
        </div>
      ) : (
        <>
          <StatsMes stats={stats} />
          <GraficaCategorias porCategoria={stats.porCategoria} coloresCategorias={coloresCategorias} />
          <Grafica6Meses resumen={resumen6} />

          {loading && <p className="text-textDim text-center text-sm">Cargando...</p>}
          {!loading && txns.length === 0 && (
            <div className="bg-surface rounded-tarjeta p-6 text-center">
              <p className="text-textDim text-sm">Sin movimientos en {etiquetaMes}</p>
              <p className="text-textDim text-xs mt-1">Agrega el primero con el botón +</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
