import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import Aviso from './Aviso'
import EstadoVacio from './EstadoVacio'

afterEach(() => cleanup())

describe('Aviso', () => {
  it('siempre lleva role=alert', () => {
    // Es la razón de ser del componente: doce de los avisos que reemplaza no lo
    // tenían, así que una escritura fallida no se anunciaba.
    render(<Aviso>No se pudo guardar</Aviso>)
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar')
  })

  it('el de atención también se anuncia', () => {
    render(<Aviso tono="atencion">Faltan 3 días para el cierre</Aviso>)
    expect(screen.getByRole('alert')).toHaveTextContent('Faltan 3 días')
  })

  it('sin onCerrar no hay botón; con onCerrar, descarta', () => {
    const { unmount } = render(<Aviso>sin botón</Aviso>)
    expect(screen.queryByRole('button')).toBeNull()
    unmount()

    const onCerrar = vi.fn()
    render(<Aviso onCerrar={onCerrar}>con botón</Aviso>)
    fireEvent.click(screen.getByLabelText('Cerrar aviso'))
    expect(onCerrar).toHaveBeenCalledTimes(1)
  })
})

describe('EstadoVacio', () => {
  it('NO es un alert: la ausencia de datos no es un anuncio', () => {
    render(<EstadoVacio titulo="Sin cuentas aún" pista="Agrega la primera" />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('Sin cuentas aún')).toBeInTheDocument()
    expect(screen.getByText('Agrega la primera')).toBeInTheDocument()
  })

  it('el icono no se anuncia', () => {
    const { container } = render(<EstadoVacio icono="📈" titulo="Sin inversiones" />)
    // Un emoji decorativo leído en voz alta antes del título es ruido.
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('📈')
  })
})
