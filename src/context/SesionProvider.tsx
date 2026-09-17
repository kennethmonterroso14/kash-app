import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useCuentas } from '../hooks/useCuentas'
import { useCategorias } from '../hooks/useCategorias'
import { useTarjetas } from '../hooks/useTarjetas'
import { SesionCtx, PERFIL_DEFAULT, type Perfil, type Sesion } from './sesion'

export function SesionProvider({ userId, children }: { userId: string; children: ReactNode }) {
  // Paso 1 de la migración: el provider usa los hooks existentes por dentro,
  // así que el comportamiento es idéntico — solo cambia que se montan UNA vez.
  const cuentas = useCuentas(userId)
  const categorias = useCategorias(userId)
  const tarjetas = useTarjetas(userId)

  const [perfil, setPerfil] = useState<Perfil>(PERFIL_DEFAULT)
  const [perfilCargando, setPerfilCargando] = useState(true)
  const [perfilError, setPerfilError] = useState<string | null>(null)
  const genRef = useRef(0)

  const refrescarPerfil = useCallback(async () => {
    const gen = ++genRef.current
    const { data, error } = await supabase
      .from('profiles')
      .select('nombre, moneda, tipo_cambio_usd, tipo_cambio_actualizado_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (gen !== genRef.current) return
    if (error) {
      // No se sustituye el perfil por defaults en la rama de error: presentar
      // GTQ como un hecho cuando no se pudo leer la moneda del usuario es
      // justo la clase de bug que se corrigió en el resto de la app.
      setPerfilError(error.message)
    } else {
      setPerfilError(null)
      setPerfil({
        ...PERFIL_DEFAULT,
        ...(data ?? {}),
        // `locale` y `zona_horaria` llegan en la tarea 1.3.4; hasta entonces
        // valen los defaults y el resto del perfil sí es real.
      })
    }
    setPerfilCargando(false)
  }, [userId])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; ver useCuentas
  useEffect(() => { refrescarPerfil() }, [refrescarPerfil])

  const valor = useMemo<Sesion>(() => ({
    userId,
    perfil,
    cuentas: cuentas.cuentas,
    totalPatrimonio: cuentas.totalPatrimonio,
    categoriasGasto: categorias.categoriasGasto,
    categoriasIngreso: categorias.categoriasIngreso,
    coloresCategorias: categorias.coloresCategorias,
    categoriasPropias: categorias.custom,
    tarjetas: tarjetas.tarjetas,
    resumenTCs: tarjetas.resumenTCs,
    totalDeuda: tarjetas.totalDeuda,
    cargando: {
      perfil: perfilCargando,
      cuentas: cuentas.loading,
      categorias: categorias.loading,
      tarjetas: tarjetas.loading,
    },
    error: {
      perfil: perfilError,
      cuentas: cuentas.error,
      categorias: categorias.error,
      tarjetas: tarjetas.error,
    },
    refrescar: {
      perfil: refrescarPerfil,
      cuentas: cuentas.recargar,
      categorias: categorias.recargar,
      tarjetas: tarjetas.recargar,
      todo: async () => {
        await Promise.all([
          refrescarPerfil(), cuentas.recargar(), categorias.recargar(), tarjetas.recargar(),
        ])
      },
    },
    agregarCategoria: categorias.agregarCategoria,
    eliminarCategoria: categorias.eliminarCategoria,
    agregarTC: tarjetas.agregarTC,
    actualizarTC: tarjetas.actualizarTC,
    archivarTC: tarjetas.archivarTC,
    cerrarCiclo: tarjetas.cerrarCiclo,
    registrarCargo: tarjetas.registrarCargo,
    registrarPago: tarjetas.registrarPago,
  }), [userId, perfil, perfilCargando, perfilError, refrescarPerfil, cuentas, categorias, tarjetas])

  return <SesionCtx.Provider value={valor}>{children}</SesionCtx.Provider>
}

