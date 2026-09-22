import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useCuentas } from '../hooks/useCuentas'
import { useCategorias } from '../hooks/useCategorias'
import { useTarjetas } from '../hooks/useTarjetas'
import { zonaValida } from '../lib/constants'
import { SesionCtx, PERFIL_DEFAULT, type Perfil, type Sesion } from './sesion'

export function SesionProvider(
  { userId, email, children }: { userId: string; email: string | null; children: ReactNode },
) {
  // El perfil va PRIMERO porque useTarjetas necesita su zona horaria.
  const [perfil, setPerfil] = useState<Perfil>(PERFIL_DEFAULT)
  const [perfilCargando, setPerfilCargando] = useState(true)
  const [perfilError, setPerfilError] = useState<string | null>(null)
  const genRef = useRef(0)

  // Generación de transacciones: la incrementa cualquier escritura y los hooks
  // acotados por mes la escuchan (ver `generacionTxns` en sesion.ts).
  const [generacionTxns, setGeneracionTxns] = useState(0)
  const invalidarTxns = useCallback(() => setGeneracionTxns(g => g + 1), [])

  // El provider usa los hooks existentes por dentro, así que el comportamiento
  // es idéntico — solo cambia que se montan UNA vez.
  const cuentas = useCuentas(userId)
  const categorias = useCategorias(userId)
  // useTarjetas no puede usar useFechas(): consumiría el contexto que este
  // mismo componente provee. La zona viaja por parámetro; antes de que el
  // perfil cargue es la default, y eso solo afecta a un ciclo recién abierto.
  const tarjetas = useTarjetas(userId, perfil.zona_horaria)

  const refrescarPerfil = useCallback(async () => {
    const gen = ++genRef.current
    const { data, error } = await supabase
      .from('profiles')
      .select('nombre, moneda, locale, zona_horaria, tipo_cambio_usd, tipo_cambio_actualizado_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (gen !== genRef.current) return
    if (error) {
      // No se sustituye el perfil por defaults en la rama de error: presentar
      // GTQ como un hecho cuando no se pudo leer la moneda del usuario es
      // justo la clase de bug que se corrigió en el resto de la app.
      setPerfilError(
        // Guarda contra una base sin la migración de 1.3.4 aplicada, como hace
        // useInversiones: el síntoma sería que TODO el perfil falla por dos
        // columnas nuevas, y el mensaje crudo no dice qué hacer.
        /does not exist/i.test(error.message)
          ? 'Falta una columna de perfil. ¿Ejecutaste la migración 20260917010000_profiles_locale_zona_horaria.sql?'
          : error.message,
      )
    } else if (data && !zonaValida(data.zona_horaria)) {
      // `hoyEn()` lanza con una zona inválida, y lanzar en render desmonta el
      // árbol. Se marca error en el slice en lugar de caer a Guatemala: de la
      // zona salen los límites de mes de todas las consultas, así que adivinar
      // acá guardaría transacciones con la fecha equivocada.
      setPerfilError(`Tu zona horaria (${data.zona_horaria}) no es válida. Corrígela antes de seguir.`)
    } else {
      setPerfilError(null)
      setPerfil({ ...PERFIL_DEFAULT, ...(data ?? {}) })
    }
    setPerfilCargando(false)
  }, [userId])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; ver useCuentas
  useEffect(() => { refrescarPerfil() }, [refrescarPerfil])

  /**
   * Un `pago_tc` baja la deuda de la tarjeta Y debita la cuenta bancaria, así
   * que toca dos slices. `useTarjetas` recarga el suyo, pero NO puede tocar el
   * de cuentas: este provider lo monta, así que no puede leer su propio
   * contexto. Componer los dos es trabajo del provider, que es lo único que
   * conoce ambos.
   *
   * Sin esto, después de registrar un pago de tarjeta la deuda bajaba en
   * pantalla pero el saldo de la cuenta seguía como antes hasta un reload
   * completo — el provider está montado por encima del router, así que navegar
   * no lo vuelve a montar.
   */
  const registrarPagoTC = useCallback(
    async (...args: Parameters<typeof tarjetas.registrarPago>) => {
      const r = await tarjetas.registrarPago(...args)
      await cuentas.recargar()
      // Un pago_tc también inserta una fila en `transacciones` (debita la cuenta):
      // la lista del mes y el resumen de 6 meses tienen que volver a pedir.
      invalidarTxns()
      return r
    },
    [tarjetas, cuentas, invalidarTxns],
  )

  /**
   * Un `gasto_tc` es una compra: cuenta como gasto (esGastoComputable) y por lo
   * tanto mueve las cifras del Dashboard y de Presupuestos. `useTarjetas` recarga
   * su propio slice, pero como esas cifras salen de hooks por mes que no montamos
   * acá, hay que incrementar la generación para que se re-consulten.
   */
  const registrarCargoTC = useCallback(
    async (...args: Parameters<typeof tarjetas.registrarCargo>) => {
      const r = await tarjetas.registrarCargo(...args)
      invalidarTxns()
      return r
    },
    [tarjetas, invalidarTxns],
  )

  const valor = useMemo<Sesion>(() => ({
    userId,
    email,
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
    generacionTxns,
    invalidarTxns,
    agregarCategoria: categorias.agregarCategoria,
    eliminarCategoria: categorias.eliminarCategoria,
    agregarTC: tarjetas.agregarTC,
    actualizarTC: tarjetas.actualizarTC,
    archivarTC: tarjetas.archivarTC,
    cerrarCiclo: tarjetas.cerrarCiclo,
    registrarCargo: registrarCargoTC,
    registrarPago: registrarPagoTC,
  }), [userId, email, perfil, perfilCargando, perfilError, refrescarPerfil, cuentas, categorias, tarjetas, generacionTxns, invalidarTxns, registrarCargoTC, registrarPagoTC])

  return <SesionCtx.Provider value={valor}>{children}</SesionCtx.Provider>
}

