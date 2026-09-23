import { PERFIL_DEFAULT, type Perfil, type Sesion } from '../context/sesion'

/**
 * Sesión de mentira para probar hooks que solo LEEN del contexto.
 *
 * Montar `SesionCtx.Provider` directo evita arrastrar el mock de Supabase a
 * tests que no consultan nada. Para probar el provider en sí (que una carga por
 * slice, que un slice caído no tumbe a los otros) va `SesionProvider.test.tsx`,
 * que sí monta el provider real.
 */
/**
 * Los writers no se implementan: un test de lectura que llame a uno está
 * probando algo que este helper no modela, y es mejor que lo diga. Devolver
 * `Promise<never>` hace que encaje con cualquier firma sin un solo cast.
 */
const noImplementado = async (): Promise<never> => {
  throw new Error('sesionFalsa(): los writers no están implementados; este helper es solo de lectura')
}

export function sesionFalsa(perfil: Partial<Perfil> = {}, errorPerfil: string | null = null): Sesion {
  const nada = async () => {}
  return {
    userId: 'u1',
    email: 'k@test.gt',
    perfil: { ...PERFIL_DEFAULT, ...perfil },
    cuentas: [],
    totalPatrimonio: 0,
    categoriasGasto: [],
    categoriasIngreso: [],
    coloresCategorias: {},
    categoriasPropias: [],
    tarjetas: [],
    resumenTCs: [],
    totalDeuda: 0,
    cargando: { perfil: false, cuentas: false, categorias: false, tarjetas: false },
    error: { perfil: errorPerfil, cuentas: null, categorias: null, tarjetas: null },
    refrescar: { perfil: nada, cuentas: nada, categorias: nada, tarjetas: nada, todo: nada },
    generacionTxns: 0,
    invalidarTxns: () => {},
    actualizarCuenta:  noImplementado,
    eliminarCuenta:    noImplementado,
    agregarCategoria:  noImplementado,
    eliminarCategoria: noImplementado,
    agregarTC:         noImplementado,
    actualizarTC:      noImplementado,
    archivarTC:        noImplementado,
    cerrarCiclo:       noImplementado,
    registrarCargo:    noImplementado,
    registrarPago:     noImplementado,
  }
}
