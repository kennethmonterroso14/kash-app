import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { CLASE_INPUT } from '../lib/clasesUI'

interface Comunes {
  etiqueta: ReactNode
  /** Texto de ayuda bajo el control. */
  pista?: ReactNode
  /** Clases extra sobre el control (`text-xl tabular-nums`, típicamente). */
  clase?: string
}

type PropsInput = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className' | 'type'>
type PropsSelect = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'>
type PropsArea = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'>

type Props = Comunes & (
  | ({ tipo: 'select' } & PropsSelect)
  | ({ tipo: 'area' } & PropsArea)
  | ({ tipo?: 'text' | 'number' | 'date' | 'month' | 'email' | 'password' } & PropsInput)
)

/**
 * Un campo de formulario: etiqueta, `id` y control, los tres del mismo dueño.
 *
 * Renderiza el control en vez de recibirlo. La alternativa (pasarle el `id` al
 * hijo por render-prop) es más flexible y no resuelve el problema real: que el
 * `htmlFor` se olvide. Y se olvidaba — ocho `<label>` en cuatro páginas no
 * apuntaban a nada, y los tres inputs de `ModalCargo` no tenían etiqueta, solo
 * `placeholder`, que desaparece al escribir y no todos los lectores de pantalla
 * anuncian. Si el primitivo es dueño de los tres, la asociación no se rompe.
 *
 * Cubre texto, número, fecha, mes, email, contraseña, select y textarea, que es
 * todo lo que usan estos formularios — el textarea incluido, aunque haya un
 * solo sitio: un control que el primitivo no cubre es un control que vuelve a
 * derivar. El `as` en cada rama es el precio de tener un solo componente para
 * los tres elementos: la unión discriminada por `tipo` ya validó las props en
 * el sitio de llamada, que es donde importa, pero TS no la propaga a través del
 * `...resto`.
 */
export default function Campo(props: Props) {
  const id = useId()
  const { etiqueta, pista, clase, tipo, ...resto } = props
  const claseControl = `w-full ${CLASE_INPUT}${clase ? ` ${clase}` : ''}`

  return (
    <div>
      <label htmlFor={id} className="text-textDim text-xs mb-1 block tracking-micro">{etiqueta}</label>
      {tipo === 'select'
        ? <select id={id} className={claseControl} {...(resto as PropsSelect)} />
        : tipo === 'area'
        ? <textarea id={id} className={`${claseControl} resize-none`} {...(resto as PropsArea)} />
        : <input id={id} type={tipo ?? 'text'} className={claseControl} {...(resto as PropsInput)} />}
      {pista && <p className="text-textDim text-xs mt-1">{pista}</p>}
    </div>
  )
}
