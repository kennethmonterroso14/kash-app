# Conector MCP: asistentes de IA

Vorta expone un servidor MCP en **`https://kash-app-rho.vercel.app/api/mcp`**. Con él, cada
persona conecta su IA (Claude, ChatGPT, Cursor, VS Code…) a su propia cuenta: la IA puede leer sus
cuentas, movimientos y el resumen del mes, y registrar movimientos (por ejemplo, un estado de
cuenta entero), transferencias y cuentas. Diseño completo:
`docs/superpowers/specs/2026-09-24-mcp-asistentes-design.md`.

## Cómo funciona

```
IA ──POST /api/mcp──▶ 401 + WWW-Authenticate: resource_metadata=…/.well-known/oauth-protected-resource/api/mcp
IA ──GET metadata──▶ { authorization_servers: ["https://<ref>.supabase.co/auth/v1"] }
IA ──registro dinámico + /oauth/authorize (Supabase Auth, PKCE)
   └─▶ Vorta /oauth/consent?authorization_id=…  (login si hace falta → Permitir)
IA ◀── access token de Supabase (el `sub` es la persona)
IA ──POST /api/mcp  Authorization: Bearer …──▶ herramientas, con RLS de esa persona
```

- `api/mcp.ts` — el handler de Vercel. La lógica está en `api/_lib/` (protocolo, herramientas,
  validación), probada con `npm test`.
- `api/oauth-protected-resource.ts` — la metadata (RFC 9728). `vercel.json` la sirve en
  `/.well-known/oauth-protected-resource` y `…/api/mcp`.
- **No hay service role en ningún lado.** La función reenvía el token de la persona a PostgREST:
  RLS es la misma frontera que en la app. Las variables son las del build (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`), que Vercel también entrega a las funciones.
- Los imports relativos dentro de `api/` llevan `.js` explícito: Vercel corre las funciones como
  ESM de Node sin bundler, y un import sin extensión falla recién en producción. Por eso también
  `api/` solo importa de `src/` módulos sin imports propios (`finanzas.ts`, `constants.ts`,
  `altaCuentaEn.ts`, `tokens.js`) — **nunca `lib/supabase.ts`**, que lee `import.meta.env`.

## Activarlo en Supabase (una vez, lo hace el dueño)

1. **Authentication → OAuth Server**: activar *Enable OAuth server*.
2. En esa misma pantalla, **Authorization path**: `/oauth/consent`.
3. Activar **Allow dynamic client registration**. Claude y ChatGPT se registran solos; sin esto,
   el conector no se puede agregar.
4. **Authentication → URL Configuration → Site URL** debe ser `https://kash-app-rho.vercel.app`
   (Supabase arma la URL de consentimiento como Site URL + Authorization path).

Probarlo: en Claude, *Configuración → Conectores → Agregar conector personalizado* → pegar la URL
→ iniciar sesión en Vorta → **Permitir**. Si el paso de autorización falla con 404, el OAuth Server
no está activado; si falla el registro, falta el paso 3.

## Herramientas

| Nombre | Escribe | Qué hace |
|---|---|---|
| `obtener_contexto` | — | Perfil (moneda, zona, hoy), cuentas activas con id y saldo, categorías válidas. |
| `listar_movimientos` | — | El estado mensual: movimientos de un mes, opcionalmente de una cuenta. |
| `resumen_mes` | — | Ingresos, gastos, neto, % de ahorro, gasto por categoría (`calcEstadisticasMes`). |
| `registrar_movimientos` | sí | Hasta 100 ingresos/gastos. Todo o nada; omite duplicados por defecto. |
| `transferir` | sí | Dos patas `ajuste` / `Transferencia`, como la app. |
| `crear_cuenta` | sí | `crearCuentaConSaldoEn`, con la misma compensación que `ModalCuenta`. |
| `fijar_saldo_cuenta` | sí | Pone el saldo real registrando la diferencia (como "Cambiar saldo"). |
| `editar_movimiento` | con permiso | Descripción, fecha, notas; en ingresos/gastos también monto y categoría. |
| `borrar_movimientos` | con permiso | Hasta 50 por id, todo o nada. |
| `editar_cuenta` | con permiso | Nombre y tipo. |
| `eliminar_cuenta` | con permiso | Con `decidirBajaCuenta`: bloquea con saldo o pagos fijos, archiva o borra. |

"Con permiso" = la persona activó **Permitir editar y borrar** en Ajustes → Asistentes de IA
(`profiles.ia_puede_editar`, apagado por defecto). Nada toca tarjetas de crédito
(`gasto_tc`/`pago_tc`).

## Seguridad: lo que hay que saber

- **El token que se aprueba es de la cuenta, no del conector.** Es un JWT normal de Supabase con
  el claim `client_id`; con él, un cliente podría hablarle a PostgREST directamente. Por eso los
  límites no viven solo en el conector sino **en la base** (`schema.sql`, sección 4b, migración
  `20260924000000_acceso_ia.sql`): con `client_id`, policies restrictivas bloquean UPDATE y DELETE
  en las once tablas salvo que `profiles.ia_puede_editar` esté activo; `profiles` no se puede
  modificar nunca (si no, el asistente se daría el permiso a sí mismo); `borrar_mi_cuenta()` lanza
  siempre y `cerrar_ciclo_tc()` sigue el permiso. SELECT e INSERT no cambian, y los triggers de
  saldo y deuda siguen funcionando porque son `security definer` con dueño con BYPASSRLS.
  `supabase/tests/acceso_ia.sql` lo prueba con RLS de verdad (rol `authenticated` y claims).
- **El alcance es una sola persona.** No hay service role en la función: un asistente, bien o mal
  intencionado, no puede ver ni tocar datos de otra cuenta ni la estructura de la base.
- La pantalla de consentimiento muestra a qué dominio vuelve (el nombre del cliente lo elige quien
  lo registra y no prueba nada) y pide aprobar solo asistentes de confianza: un asistente
  aprobado puede LEER todo lo de la persona.
- Revocar: Ajustes → Asistentes de IA → Desconectar (`auth.oauth.revokeGrant`). Como la función
  valida cada token con `auth.getUser`, un acceso revocado deja de servir enseguida.
