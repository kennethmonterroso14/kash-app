# Diseño: conector MCP para asistentes de IA

**Pedido:** que cada persona pueda conectar su IA (Claude, ChatGPT, Cursor…) a Vorta para
registrar movimientos y cuentas, y para cargarle sus estados mensuales — leerlos o importarlos.

## Decisión: servidor MCP remoto + OAuth 2.1 de Supabase

- **Dónde corre:** una función de Vercel en este mismo repo, `api/mcp.ts`, sin estado
  (Streamable HTTP, respuestas JSON). La URL que la persona pega en su IA es
  `https://<dominio>/api/mcp`.
- **Quién autentica:** Supabase Auth como servidor OAuth 2.1 (beta, gratis). La IA descubre el
  servidor de autorización desde `/.well-known/oauth-protected-resource`, se registra sola
  (registro dinámico de clientes) y manda a la persona a iniciar sesión en Vorta con su usuario de
  siempre — correo o Google. **No hay cuentas ni contraseñas nuevas.**
- **Consentimiento:** Supabase redirige a `/oauth/consent?authorization_id=…`, una pantalla de la
  app que dice qué IA pide acceso y qué podrá hacer, con Permitir / Cancelar.
- **Aislamiento:** la función NO usa la service role. Reenvía el token de la persona a PostgREST,
  así que RLS (`auth.uid() = user_id`) es la misma frontera que protege a la app. Un token
  inválido o vencido es un 401 con `WWW-Authenticate` que apunta a la metadata.
- **Revocar:** Ajustes → Asistentes de IA lista las apps conectadas
  (`auth.oauth.listGrants`) y permite desconectarlas (`revokeGrant`).

Descartado — **tokens personales de API**: obligaban a guardar secretos propios y a usar la
service role en el servidor (saltándose RLS), y ni Claude ni ChatGPT los piden: los dos hablan
OAuth con registro dinámico.

## Herramientas

| Herramienta | Qué hace |
|---|---|
| `obtener_contexto` | Perfil (moneda, zona, hoy), cuentas activas con saldo e id, categorías de gasto e ingreso. La IA la llama primero. |
| `listar_movimientos` | Movimientos de un mes (`YYYY-MM`), opcionalmente de una cuenta. |
| `resumen_mes` | Ingresos, gastos, neto, % de ahorro y gasto por categoría — `calcEstadisticasMes`. |
| `registrar_movimientos` | Hasta 100 ingresos/gastos de una vez (importar un estado de cuenta). Todo o nada; omite duplicados por defecto. |
| `transferir` | Entre dos cuentas propias: las dos patas `ajuste` / `Transferencia`, como la app. |
| `crear_cuenta` | Alta con saldo inicial — la misma lógica y compensación que `ModalCuenta`. |
| `fijar_saldo_cuenta` | Pone una cuenta en el saldo real (el final del estado): inserta el `ajuste` por la diferencia. |

Reglas que se heredan de la app, sin excepción:

- Montos de entrada en unidades (`125.50`), validados y pasados a centavos con `toCentavos`; el
  signo lo pone el servidor según el tipo.
- `cuentas.saldo` nunca se escribe: todo es una fila de `transacciones` y el trigger hace el resto.
- Fechas en la zona del perfil; no se aceptan fechas futuras.
- Categorías: solo las que la persona tiene (base + propias). Una desconocida rechaza el lote y
  la respuesta lista las válidas, para que la IA corrija sin adivinar.
- **Duplicados:** importar el mismo estado dos veces no duplica. Un movimiento se omite si ya hay
  uno en la misma cuenta, fecha, monto y descripción; se compara como multiconjunto, así que tres
  cafés iguales en el estado contra dos ya registrados insertan uno.
- **Sin borrar ni editar.** Lo que la IA registre mal se corrige desde la app. Las tarjetas de
  crédito (`gasto_tc`/`pago_tc`) quedan fuera en esta versión: su reparto de deuda por ciclo es
  justo lo que la app no deja editar a mano.

## Lo que hace el dueño en Supabase (una vez)

Authentication → OAuth Server: activar, *Authorization path* `/oauth/consent`, activar
*Dynamic client registration*. El Site URL ya es el dominio de producción. Pasos en `docs/MCP.md`.

---

# Plan

- [x] `api/_lib/`: protocolo MCP (JSON-RPC, CORS, 401), validación pura y herramientas; tests.
- [x] `api/mcp.ts` y `api/oauth-protected-resource.ts`; `vercel.json` y el SW no deben tragarse
      `/api` ni `/.well-known`; `tsconfig.api.json` para que `tsc -b` los revise.
- [x] `crearCuentaConSaldo` recibe el cliente, para que la función la reutilice.
- [x] `/oauth/consent`: pantalla de consentimiento; volver a ella después de entrar con Google.
- [x] Ajustes → Asistentes de IA: la URL para copiar, cómo conectar y las apps conectadas.
- [x] `docs/MCP.md`, Política de privacidad y CLAUDE.md.
