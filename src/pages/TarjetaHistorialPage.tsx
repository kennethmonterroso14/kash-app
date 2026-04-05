// src/pages/TarjetaHistorialPage.tsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useCiclosTC, type CicloTC, type TransaccionCiclo } from '../hooks/useCiclosTC'
import { useTarjetas } from '../hooks/useTarjetas'
import { formatQ } from '../lib/finanzas'

interface Props { userId: string }

const MESES_LOCAL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const ESTADO_BADGE: Record<string, { label: string; cls: string }> = {
  abierto:  { label: 'Abierto',  cls: 'bg-accent/15 text-accent' },
  cerrado:  { label: 'Cerrado',  cls: 'bg-warning/15 text-warning' },
  pagado:   { label: 'Pagado',   cls: 'bg-success/15 text-success' },
}

function formatPeriodo(inicio: string, cierre: string): string {
  const [, im, id] = inicio.split('-').map(Number)
  const [, cm, cd] = cierre.split('-').map(Number)
  return `${id} ${MESES_LOCAL[im - 1].slice(0, 3)} – ${cd} ${MESES_LOCAL[cm - 1].slice(0, 3)}`
}

export default function TarjetaHistorialPage({ userId }: Props) {
  const { id: tarjetaId = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { tarjetas } = useTarjetas(userId)
  const { ciclos, loading, error, fetchTransaccionesCiclo } = useCiclosTC(userId, tarjetaId)

  const tc = tarjetas.find(t => t.id === tarjetaId)

  // Modal de transacciones
  const [cicloSelId, setCicloSelId]   = useState<string | null>(null)
  const [txns, setTxns]               = useState<TransaccionCiclo[]>([])
  const [loadingTxns, setLoadingTxns] = useState(false)
  const [errTxns, setErrTxns]         = useState<string | null>(null)

  const abrirModal = async (ciclo: CicloTC) => {
    setCicloSelId(ciclo.id)
    setTxns([])
    setErrTxns(null)
    setLoadingTxns(true)
    try {
      const data = await fetchTransaccionesCiclo(ciclo.id)
      setTxns(data)
    } catch (e: unknown) {
      setErrTxns(e instanceof Error ? e.message : 'Error al cargar transacciones')
    } finally {
      setLoadingTxns(false)
    }
  }

  const cerrarModal = () => { setCicloSelId(null); setTxns([]) }

  const cicloSel = ciclos.find(c => c.id === cicloSelId) ?? null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-muted text-sm">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/tarjetas')}
          className="text-accent text-xl hover:opacity-80 transition-opacity"
        >
          ←
        </button>
        <div>
          <h1 className="text-white font-display font-bold text-xl">
            {tc?.nombre ?? 'Historial'}
          </h1>
          <p className="text-muted text-xs">Estados de cuenta</p>
        </div>
      </div>

      {error && (
        <p className="text-danger text-sm bg-danger/10 rounded-xl p-3 mb-4">{error}</p>
      )}

      {ciclos.length === 0 && !loading && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-muted text-sm">Sin ciclos registrados</p>
          <p className="text-textDim text-xs mt-1">Los ciclos aparecen al registrar cargos</p>
        </div>
      )}

      {/* Lista de ciclos */}
      <div className="flex flex-col gap-3">
        {ciclos.map(ciclo => {
          const badge = ESTADO_BADGE[ciclo.estado] ?? ESTADO_BADGE['cerrado']
          return (
            <div key={ciclo.id} className="bg-surface rounded-2xl p-4">
              {/* Encabezado del ciclo */}
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-white text-sm font-semibold">
                    {formatPeriodo(ciclo.fecha_inicio, ciclo.fecha_cierre)}
                  </p>
                  <p className="text-muted text-xs mt-0.5">
                    Pago: {ciclo.fecha_pago}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>

              {/* Métricas del ciclo */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-bg rounded-xl p-2.5 text-center">
                  <p className="text-muted text-xs mb-0.5">Cargos</p>
                  <p className="text-danger font-mono font-semibold text-xs">
                    {formatQ(ciclo.total_cargos)}
                  </p>
                </div>
                <div className="bg-bg rounded-xl p-2.5 text-center">
                  <p className="text-muted text-xs mb-0.5">Pagos</p>
                  <p className="text-success font-mono font-semibold text-xs">
                    {formatQ(ciclo.total_pagos)}
                  </p>
                </div>
                <div className="bg-bg rounded-xl p-2.5 text-center">
                  <p className="text-muted text-xs mb-0.5">Saldo</p>
                  <p className={`font-mono font-semibold text-xs ${ciclo.saldo_final > 0 ? 'text-warning' : 'text-white'}`}>
                    {formatQ(ciclo.saldo_final)}
                  </p>
                </div>
              </div>

              {/* Botón ver transacciones */}
              <button
                onClick={() => abrirModal(ciclo)}
                className="w-full py-2 rounded-xl bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors"
              >
                Ver transacciones →
              </button>
            </div>
          )
        })}
      </div>

      {/* Modal bottom sheet — transacciones del ciclo */}
      {cicloSelId && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-50" onClick={cerrarModal}>
          <div
            className="bg-surface w-full rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-white font-semibold text-sm">Transacciones del ciclo</h2>
                {cicloSel && (
                  <p className="text-muted text-xs mt-0.5">
                    {formatPeriodo(cicloSel.fecha_inicio, cicloSel.fecha_cierre)}
                  </p>
                )}
              </div>
              <button onClick={cerrarModal} className="text-muted hover:text-white text-lg">✕</button>
            </div>

            {loadingTxns && (
              <p className="text-muted text-sm text-center py-8">Cargando...</p>
            )}

            {errTxns && (
              <p className="text-danger text-sm bg-danger/10 rounded-xl p-3">{errTxns}</p>
            )}

            {!loadingTxns && txns.length === 0 && !errTxns && (
              <p className="text-muted text-sm text-center py-8">Sin transacciones en este ciclo</p>
            )}

            <div className="flex flex-col gap-2">
              {txns.map(tx => (
                <div key={tx.id} className="flex justify-between items-center py-2.5 border-b border-muted/10 last:border-0">
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-white text-sm truncate">{tx.descripcion}</p>
                    <p className="text-muted text-xs">{tx.categoria} · {tx.fecha}</p>
                  </div>
                  <p className={`font-mono text-sm font-semibold flex-shrink-0 ${tx.cantidad < 0 ? 'text-danger' : 'text-success'}`}>
                    {tx.cantidad < 0 ? '−' : '+'}{formatQ(Math.abs(tx.cantidad))}
                  </p>
                </div>
              ))}
            </div>

            {/* Total del modal */}
            {txns.length > 0 && (
              <div className="border-t border-muted/20 pt-3 mt-2 flex justify-between">
                <span className="text-muted text-sm">{txns.length} transacciones</span>
                <span className="font-mono text-sm text-white font-semibold">
                  {formatQ(txns.reduce((s, t) => s + Math.abs(t.cantidad), 0))}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
