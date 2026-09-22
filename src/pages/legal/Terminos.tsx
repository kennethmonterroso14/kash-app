import PaginaLegal, { H, L, P } from './PaginaLegal'

/**
 * Términos de uso. Requisito de App Store y Google Play.
 *
 * Deliberadamente corto y concreto. Lo importante de estos términos para esta
 * app son dos cosas: que los números los pone el usuario y la app solo los
 * suma, y que no es asesoría financiera. El resto es lo mínimo.
 *
 * No es asesoría legal.
 */
export default function Terminos() {
  return (
    <PaginaLegal titulo="Términos de uso" vigencia="22 de septiembre de 2026">
      <P>
        Al usar Vorta aceptás lo que sigue. Está escrito para que se entienda, no para que no se
        entienda.
      </P>

      <H>Qué es Vorta</H>
      <P>
        Una herramienta para anotar y ordenar tus finanzas personales. Vos registrás tus cuentas,
        movimientos, tarjetas, presupuestos, metas e inversiones; la app los organiza, los suma y te
        muestra el resultado.
      </P>

      <H>Los números son tuyos</H>
      <P>
        <strong className="text-text">La app no se conecta a tu banco.</strong> Todo lo que ves sale
        de lo que vos anotaste. Si un saldo no coincide con tu banco, lo que falta o sobra es un
        movimiento sin registrar — la app no tiene otra fuente con la que comparar.
      </P>
      <P>
        Los cálculos derivados (saldo disponible, deuda de tarjeta, patrimonio neto, proyecciones)
        se hacen sobre esos datos. Son tan exactos como lo que hayas ingresado.
      </P>

      <H>No es asesoría financiera</H>
      <P>
        Nada en la app es una recomendación de inversión, de crédito ni de gasto. Las proyecciones
        son una aritmética sobre supuestos que vos elegís: no son una predicción ni una promesa de
        rendimiento. Las decisiones sobre tu dinero son tuyas, y conviene consultarlas con un
        profesional.
      </P>

      <H>Tu cuenta</H>
      <L>
        <li>Sos responsable de tu contraseña y de lo que se haga con tu cuenta.</li>
        <li>Una cuenta es para una persona. No la compartas.</li>
        <li>Podés borrarla cuando quieras desde Ajustes, y el borrado es completo e irreversible.</li>
      </L>

      <H>Respaldos</H>
      <P>
        La app no te da una función de respaldo ni de restauración. Si tus datos son importantes
        para vos, exportá tus movimientos a CSV desde Movimientos cada tanto. Si borrás tu cuenta o
        una fila, no hay forma de recuperarla desde la app.
      </P>

      <H>Disponibilidad y garantías</H>
      <P>
        La app se ofrece tal como está. No se garantiza que esté disponible sin interrupciones ni
        que esté libre de errores. En la medida que la ley lo permita, no se asume responsabilidad
        por pérdidas derivadas de usarla — incluidas decisiones tomadas a partir de los números que
        muestra.
      </P>

      <H>Uso aceptable</H>
      <P>
        No intentes acceder a datos de otras personas, ni romper los límites de seguridad de la
        base, ni usar la app para algo ilegal. Si detectás una falla de seguridad, avisá antes de
        publicarla.
      </P>

      <H>Cambios</H>
      <P>
        Estos términos pueden cambiar; la fecha de arriba dice cuándo fue la última vez. Seguir
        usando la app después de un cambio significa aceptarlo.
      </P>

      <P>
        <span className="text-textDim/70">
          Este documento no constituye asesoría legal.
        </span>
      </P>
    </PaginaLegal>
  )
}
