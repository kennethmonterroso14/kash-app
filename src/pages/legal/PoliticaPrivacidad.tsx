import PaginaLegal, { H, L, P } from './PaginaLegal'

/**
 * Política de privacidad. Requisito de App Store y Google Play.
 *
 * **Es una descripción de lo que la app hace de verdad, verificada contra el
 * código, no una plantilla.** Cada afirmación de acá se puede comprobar:
 *
 * - Sin analítica ni rastreo: `grep -rn "gtag|analytics|sentry|posthog|mixpanel"`
 *   sobre `src/` e `index.html` no devuelve nada.
 * - Inicio con Google (opcional, OAuth de Supabase): correo, nombre y foto.
 * - Asistentes de IA (opcional): el conector MCP `api/mcp` solo responde con
 *   el token OAuth que la persona aprobó en `/oauth/consent`, y lo que devuelve
 *   va al asistente que ella conectó. Se revoca en Ajustes → Asistentes de IA.
 * - Otra sola llamada a un tercero: `api.exchangerate-api.com` en
 *   `useInversiones.fetchTipoCambioDesdeAPI`, y es un GET de tipos de cambio
 *   que no manda ningún dato del usuario. **Esto era falso cuando se escribió**:
 *   `index.css` traía un `@import` de Google Fonts, o sea un pedido a un
 *   tercero en cada carga. La fuente pasó a servirse desde el propio origen y
 *   ahora la frase es verdad. Si alguien vuelve a agregar un `@import` remoto,
 *   este documento queda mintiendo.
 * - Todo lo demás va a Supabase con RLS `auth.uid() = user_id` en las once
 *   tablas (ver `supabase/schema.sql`).
 * - Borrar la cuenta la borra de verdad: `borrar_mi_cuenta()`.
 *
 * Si alguna de esas cosas cambia, este texto queda desactualizado y hay que
 * corregirlo. No es asesoría legal.
 */
export default function PoliticaPrivacidad() {
  return (
    <PaginaLegal titulo="Política de privacidad" vigencia="23 de septiembre de 2026">
      <P>
        Vorta es una app para llevar tus finanzas personales. Este documento dice exactamente qué
        datos se guardan, dónde, quién puede verlos y cómo borrarlos.
      </P>

      <H>Qué datos se guardan</H>
      <P>Solo lo que vos escribís en la app, más lo mínimo para tener una cuenta:</P>
      <L>
        <li><strong className="text-text">Tu correo electrónico</strong> y la contraseña que elegís. La contraseña nunca se guarda tal cual: la maneja Supabase Auth como hash. Si entrás con Google no hay contraseña: ver abajo.</li>
        <li><strong className="text-text">Tu nombre</strong>, tu moneda, tu idioma y tu zona horaria, que son los que usa la app para mostrar los montos y las fechas.</li>
        <li><strong className="text-text">Lo que registrás</strong>: cuentas y saldos, movimientos, tarjetas de crédito y sus ciclos, presupuestos, metas de ahorro, pagos fijos, categorías propias e inversiones con su historial.</li>
      </L>
      <P>
        No se piden ni se guardan números de cuenta bancaria, números completos de tarjeta,
        credenciales de tu banco, documentos de identidad, dirección ni teléfono. La app no se
        conecta a tu banco: lo que aparece acá es lo que vos anotás.
      </P>

      <H>Qué NO se hace</H>
      <L>
        <li><strong className="text-text">No hay analítica ni rastreo.</strong> Ni Google Analytics, ni píxeles, ni SDKs de medición, ni reportes de errores a terceros.</li>
        <li><strong className="text-text">No se vende ni se comparte nada</strong> con anunciantes, data brokers ni socios comerciales.</li>
        <li><strong className="text-text">No se usan tus datos para entrenar modelos</strong> ni para ningún fin que no sea mostrarte tu propia información.</li>
        <li><strong className="text-text">No hay publicidad.</strong></li>
      </L>

      <H>Dónde viven los datos</H>
      <P>
        En una base de datos PostgreSQL alojada en Supabase, en servidores de Estados Unidos. El
        acceso está restringido por fila con las políticas de seguridad de la base: cada consulta
        queda limitada a las filas cuyo dueño es tu usuario, y no existe forma de que la app te
        muestre datos de otra persona.
      </P>
      <P>
        La app en sí (el código que corre en tu teléfono o navegador) se sirve desde Vercel.
      </P>

      <H>Si entrás con Google</H>
      <P>
        Es opcional. Si elegís “Continuar con Google”, Google te pide permiso para compartir con la
        app tu <strong className="text-text">correo, tu nombre y tu foto de perfil</strong> — nada
        más: ni tus contactos, ni tu correo de Gmail, ni tu Drive. Supabase Auth guarda esos datos
        junto a tu cuenta; la app usa el correo para identificarte. Google se entera de que
        entraste a Vorta (es quien confirma que sos vos), pero no ve nada de lo que registrás
        adentro. Podés quitarle el acceso cuando quieras desde la configuración de tu cuenta de
        Google.
      </P>

      <H>Si conectás un asistente de IA</H>
      <P>
        También es opcional. Desde <strong className="text-text">Ajustes → Asistentes de IA</strong> podés
        conectar Claude, ChatGPT u otra IA a Vorta. Solo pasa si vos lo agregás en tu asistente y
        tocás <strong className="text-text">Permitir</strong> en la pantalla de Vorta que te lo pregunta.
        A partir de ahí, cuando se lo pedís, el conector de Vorta le permite leer tus cuentas, saldos,
        categorías y movimientos, y registrar movimientos o cuentas en tu nombre; no le permite borrar
        ni editar nada. Conectá solo asistentes en los que confíes: el acceso que aprobás es a tu cuenta.
        <strong className="text-text"> Lo que el asistente lee pasa a la empresa que lo ofrece</strong> y
        queda sujeto a su propia política de privacidad, no a esta. Podés desconectarlo cuando quieras
        desde la misma pantalla de Ajustes, y deja de tener acceso en ese momento.
      </P>

      <H>Las otras llamadas a terceros</H>
      <P>
        Además del inicio con Google y de los asistentes que conectes (si usás alguno), hay una sola más.
        Si tenés inversiones en dólares y tocás “Usar el tipo de cambio de hoy”, la app consulta el tipo de
        cambio público en <span className="text-text">api.exchangerate-api.com</span>. Esa consulta
        pide la tabla de tipos de cambio del dólar y <strong className="text-text">no manda ningún
        dato tuyo</strong>: ni tu correo, ni tus montos, ni un identificador. Si nunca tocás ese
        botón, no entrás con Google ni conectás un asistente, la app no habla con nadie más que con su propia base.
      </P>

      <H>Qué se guarda en tu dispositivo</H>
      <P>
        Tu sesión (el token que te mantiene conectado) se guarda en el almacenamiento local del
        navegador o del WebView, como en cualquier app con login. Al cerrar sesión se borra. La app
        no usa cookies de rastreo.
      </P>

      <H>Cuánto tiempo</H>
      <P>
        Mientras tengas la cuenta. No hay borrado automático por inactividad, porque el historial
        viejo es justamente lo que hace útil una app de finanzas.
      </P>

      <H>Cómo borrar todo</H>
      <P>
        Desde <strong className="text-text">Ajustes → Borrar mi cuenta</strong>. Borra de verdad:
        tus once tablas de datos y tu usuario de autenticación, sin copia de respaldo recuperable
        desde la app y sin período de gracia. Es irreversible, y por eso pide que escribas tu correo
        para confirmar. No hay que escribirle a nadie ni esperar aprobación.
      </P>

      <H>Tus derechos</H>
      <L>
        <li><strong className="text-text">Ver tus datos:</strong> la app entera es eso. Además, Movimientos los exporta a CSV.</li>
        <li><strong className="text-text">Corregirlos:</strong> todo lo que registrás se puede editar o borrar desde la app.</li>
        <li><strong className="text-text">Borrarlos:</strong> como se describe arriba.</li>
      </L>

      <H>Menores</H>
      <P>
        La app no está dirigida a menores de 13 años y no se recopilan datos de ellos a sabiendas.
      </P>

      <H>Cambios</H>
      <P>
        Si esto cambia, cambia la fecha de arriba. Los cambios que afecten qué datos se recopilan se
        avisarán dentro de la app antes de aplicarlos.
      </P>

      <H>Contacto</H>
      <P>
        Para cualquier pregunta sobre tus datos, escribí a la dirección de contacto publicada en la
        ficha de la app en la tienda desde la que la instalaste.
      </P>

      <P>
        <span className="text-textDim/70">
          Este documento describe el funcionamiento real de la app y no constituye asesoría legal.
        </span>
      </P>
    </PaginaLegal>
  )
}
