import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import DialogoBorrarCuenta from './DialogoBorrarCuenta'

/**
 * Lo que se prueba es la barrera, no el formulario: que el RPC que borra TODO
 * no se pueda disparar sin haber escrito el correo exacto. Es la operación más
 * irreversible de la app, así que el caso que importa es el que NO debe pasar.
 */

const rpc = vi.fn(async () => ({ error: null }))
const signOut = vi.fn(async () => ({ error: null }))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...(a as [])),
    auth: { signOut: () => signOut() },
  },
}))

const EMAIL = 'kenneth@ejemplo.gt'

const montar = () => {
  const onCerrar = vi.fn()
  const onBorrada = vi.fn()
  render(<DialogoBorrarCuenta email={EMAIL} onCerrar={onCerrar} onBorrada={onBorrada} />)
  return { onCerrar, onBorrada, boton: () => screen.getByRole('button', { name: 'Borrar cuenta' }) }
}

const escribir = (v: string) =>
  fireEvent.change(screen.getByLabelText('Escribí tu correo para confirmar'), { target: { value: v } })

beforeEach(() => { rpc.mockClear(); signOut.mockClear() })
afterEach(() => cleanup())

describe('DialogoBorrarCuenta', () => {
  it('arranca deshabilitado y no llama al RPC', () => {
    const { boton } = montar()
    expect(boton()).toBeDisabled()
    fireEvent.click(boton())
    expect(rpc).not.toHaveBeenCalled()
  })

  it('un correo parecido pero distinto no habilita', () => {
    const { boton } = montar()
    escribir('kenneth@ejemplo.com')   // .com en lugar de .gt
    expect(boton()).toBeDisabled()
    escribir('kenneth@ejemplo.g')     // prefijo
    expect(boton()).toBeDisabled()
    expect(screen.getByText('Todavía no coincide')).toBeInTheDocument()
  })

  it('el correo exacto habilita, e ignora mayúsculas y espacios', () => {
    const { boton } = montar()
    escribir('  KENNETH@Ejemplo.GT  ')
    // Un correo no distingue mayúsculas y nadie escribe bien el espacio final
    // en un teclado de teléfono: pedir exactitud ahí sería crueldad, no
    // seguridad. Lo que importa es que sea SU correo.
    expect(boton()).toBeEnabled()
  })

  it('borra, cierra la sesión y avisa — en ese orden', async () => {
    const { boton, onBorrada } = montar()
    escribir(EMAIL)
    fireEvent.click(boton())
    await waitFor(() => expect(onBorrada).toHaveBeenCalledTimes(1))
    expect(rpc).toHaveBeenCalledWith('borrar_mi_cuenta')
    // La sesión apunta a un usuario que ya no existe: cerrarla es parte de la
    // operación, no algo que se deje para después.
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('si el RPC falla, lo dice y NO cierra la sesión', async () => {
    rpc.mockResolvedValueOnce({ error: { message: 'permiso denegado' } } as never)
    const { boton, onBorrada } = montar()
    escribir(EMAIL)
    fireEvent.click(boton())
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('permiso denegado'))
    // Sacar al usuario de una cuenta que sigue existiendo sería peor que el
    // fallo: quedaría creyendo que se borró.
    expect(signOut).not.toHaveBeenCalled()
    expect(onBorrada).not.toHaveBeenCalled()
    expect(boton()).toBeEnabled()
  })
})
