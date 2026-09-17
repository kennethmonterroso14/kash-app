import type { ReactNode } from 'react'
import { SesionCtx, type Sesion } from '../context/sesion'

/**
 * Envuelve un componente en una sesión de mentira. Está en su propio archivo
 * porque un archivo que exporta un componente Y otra cosa rompe el fast
 * refresh, igual que pasó con `sesion.ts` / `SesionProvider.tsx`.
 */
export const ConSesion = ({ sesion, children }: { sesion: Sesion; children: ReactNode }) => (
  <SesionCtx.Provider value={sesion}>{children}</SesionCtx.Provider>
)
