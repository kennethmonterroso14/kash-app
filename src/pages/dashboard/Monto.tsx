import { useMoneda } from '../../hooks/useMoneda'

interface Props {
  valor: number
  oculto: boolean
  className?: string
  signo?: string
}

/**
 * Un monto que respeta el modo privado: con `oculto` muestra •••••• más un
 * equivalente para lector de pantalla, en lugar de la cifra.
 */
export default function Monto({ valor, oculto, className = '', signo = '' }: Props) {
  const fmt = useMoneda()
  if (oculto) {
    return (
      <span className="tracking-widest text-textDim">
        ••••••<span className="sr-only">oculto</span>
      </span>
    )
  }
  return <span className={`tabular-nums ${className}`}>{signo}{fmt(valor)}</span>
}
