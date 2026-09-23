import { describe, it, expect } from 'vitest'
import { decidirBajaCuenta } from './bajaCuenta'

const base = { saldo: 0, movimientos: 0, pagosFijos: 0, pagosFijosActivos: 0 }

describe('decidirBajaCuenta', () => {
  it('una cuenta vacía y sin historial se borra', () => {
    expect(decidirBajaCuenta(base)).toEqual({ accion: 'borrar' })
  })

  it('con movimientos se archiva: el on delete restrict no deja borrarla', () => {
    expect(decidirBajaCuenta({ ...base, movimientos: 3 })).toEqual({ accion: 'archivar' })
  })

  it('un pago fijo INACTIVO también impide borrar, pero no archivar', () => {
    expect(decidirBajaCuenta({ ...base, pagosFijos: 1 })).toEqual({ accion: 'archivar' })
  })

  it('con saldo se bloquea, aunque tenga movimientos (archivarla bajaría el patrimonio)', () => {
    expect(decidirBajaCuenta({ ...base, saldo: 100 })).toEqual({ accion: 'bloquear', motivo: 'saldo' })
    expect(decidirBajaCuenta({ ...base, saldo: -50, movimientos: 2 })).toEqual({ accion: 'bloquear', motivo: 'saldo' })
  })

  it('con un pago fijo activo se bloquea: se seguiría aplicando sobre una cuenta invisible', () => {
    expect(decidirBajaCuenta({ ...base, pagosFijos: 1, pagosFijosActivos: 1, movimientos: 5 }))
      .toEqual({ accion: 'bloquear', motivo: 'pagos_fijos' })
  })

  it('el saldo se revisa antes que los pagos fijos', () => {
    expect(decidirBajaCuenta({ ...base, saldo: 1, pagosFijosActivos: 1 }))
      .toEqual({ accion: 'bloquear', motivo: 'saldo' })
  })
})
