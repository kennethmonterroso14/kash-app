# Inicio de sesión con Google — configuración

El código ya está (`LoginPage` + `src/lib/authOAuth.ts`). El botón **aparece solo** cuando el
proveedor Google está activado en Supabase: la página consulta `/auth/v1/settings` y lo muestra si
`external.google` es `true`. Hasta entonces el login sigue siendo solo correo + contraseña.

Faltan dos configuraciones que se hacen a mano, fuera del repo.

## 1. Google Cloud (cuenta personal @gmail.com)

1. <https://console.cloud.google.com> → selector de proyecto → **Proyecto nuevo** → nombre `Vorta`
   (sin organización; eso es lo normal en una cuenta personal).
2. **APIs y servicios → Pantalla de consentimiento de OAuth** (en la consola nueva: *Google Auth
   Platform → Branding / Audiencia*):
   - Tipo de usuario: **Externo**.
   - Nombre de la app: `Vorta`; correo de asistencia y de contacto del desarrollador: tu @gmail.com.
   - Dominios autorizados: `supabase.co` y `vercel.app`.
   - Enlace a la política de privacidad: `https://kash-app-rho.vercel.app/ajustes/privacidad`
     (y términos: `/ajustes/terminos`).
   - Permisos (scopes): solo los básicos — `openid`, `.../auth/userinfo.email`,
     `.../auth/userinfo.profile`. Son **no sensibles**, así que no hace falta la verificación de
     Google para publicar.
   - Audiencia: mientras esté **En prueba**, solo entran los correos que agregues como *usuarios
     de prueba* (agregá el tuyo). Para que entre cualquiera, **Publicar app** → En producción.
3. **Credenciales → Crear credenciales → ID de cliente de OAuth** (*Clientes → Crear cliente*):
   - Tipo: **Aplicación web**. Nombre: `Vorta web`.
   - **Orígenes de JavaScript autorizados**: `https://kash-app-rho.vercel.app` y
     `http://localhost:5173`.
   - **URI de redireccionamiento autorizados**:
     `https://bduvzluntatmhfujqvvm.supabase.co/auth/v1/callback`
     (es Supabase quien recibe la vuelta de Google, no la app).
   - Guardá el **ID de cliente** y el **Secreto del cliente**.

## 2. Supabase (proyecto `bduvzluntatmhfujqvvm`)

1. **Authentication → Sign In / Providers → Google** → activar, pegar el ID de cliente y el
   secreto → Guardar.
2. **Authentication → URL Configuration**:
   - *Site URL*: `https://kash-app-rho.vercel.app`
   - *Redirect URLs*: agregar `https://kash-app-rho.vercel.app/**` y `http://localhost:5173/**`
     (la app vuelve a `window.location.origin`; sin estar en la lista, Supabase la manda al
     *Site URL*).

Con eso el botón aparece en el login sin redeploy.

## Cómo se comporta

- Cuenta nueva con Google → no tiene fila en `profiles` → pasa por `SetupPage` como cualquiera.
- Si ya tenés cuenta con contraseña **con el mismo correo** (y confirmado), Supabase vincula la
  identidad de Google a esa misma cuenta: entrás a tus datos de siempre, y podés seguir usando
  cualquiera de los dos métodos.
- Cancelar en Google, o un error del proveedor, vuelve al login con un aviso en español
  (`leerErrorOAuth` / `mensajeErrorOAuth`).
- Probalo también desde la app instalada en la pantalla de inicio del iPhone: el ida y vuelta a
  Google se abre dentro de la app y debería volver con la sesión puesta.
