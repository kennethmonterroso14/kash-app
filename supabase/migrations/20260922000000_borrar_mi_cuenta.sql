-- ══════════════════════════════════════════════════════════════════════
-- VORTA — Migración: borrar la cuenta desde la app (tarea 2.2)
-- Archivo: supabase/migrations/20260922000000_borrar_mi_cuenta.sql
--
-- ESTADO: PENDIENTE de aplicar. Correr a mano en Supabase → SQL Editor →
-- New query, con NADA seleccionado.
--
-- QUÉ AGREGA
--   Una función, `borrar_mi_cuenta()`. No crea ni borra columnas y no cambia
--   ninguna tabla. Requisito duro de App Store: toda app que permita crear una
--   cuenta tiene que permitir borrarla DESDE la app.
--
-- CUIDADO AL PROBARLA
--   Es la operación más irreversible de la app. **No la corras contra tu
--   propio usuario para "ver si funciona"**: borra las once tablas y la fila de
--   `auth.users`, sin vuelta. Está cubierta por seis bloques de aserciones en
--   `supabase/tests/borrar_cuenta.sql`, que corren contra un PostgreSQL local
--   con dos usuarios de prueba y verifican que no quede nada y que no se toque
--   al otro. Si querés verla en acción, creá una cuenta de prueba en la app y
--   borrá esa.
--
-- Es idempotente (`create or replace`) y se puede correr dos veces.
-- `supabase/schema.sql` ya la incluye y es el autoritativo.
-- ══════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════
-- 12. RPC: borrar la cuenta del usuario  (tarea 2.2)
--
--     Requisito duro de App Store: toda app que permita crear una cuenta
--     tiene que permitir borrarla DESDE la app, no solo desactivarla.
--
--     ── Por qué un `delete from auth.users` pelado no es suficiente ──
--     Las once tablas cuelgan de `auth.users` con `on delete cascade`, así que
--     la tentación es borrar el usuario y dejar que la base haga el resto.
--     Probado: **en el test eso funciona** y se lleva las once tablas. Aun así
--     no alcanza, por dos razones distintas y las dos medidas:
--
--     1. **El trigger de deuda lo bloquea.** `trg_deuda_tc` corre también en
--        un DELETE por cascada, y **lanza** si la fila no tiene reparto
--        guardado (`aplicado_*` en NULL). Una cuenta con filas anteriores al
--        backfill no se podría borrar nunca — y una cuenta vieja es
--        exactamente la que va a querer irse. Apagarlo necesita
--        `set_config`, o sea una función: no se puede hacer desde el cliente.
--        Esta es la razón que obliga al RPC.
--     2. **El orden entre hermanas no está garantizado.** Hay FKs entre tablas
--        hermanas que no son cascade: `transacciones.cuenta_id` y
--        `pagos_recurrentes.cuenta_id` son `on delete restrict`, y
--        `transacciones.tarjeta_id` / `ciclo_id` son NO ACTION. Un `restrict`
--        se evalúa de inmediato y Postgres no promete en qué orden procesa los
--        cascades, así que que hoy funcione no es una garantía de que siga
--        funcionando. Con el orden explícito no depende de eso.
--
--     Que el orden importa de verdad está medido: quitar `transacciones` de la
--     lista rompe con `transacciones_ciclo_id_fkey` al borrar `ciclos_tc`.
--
--     ── Por qué apaga el trigger de deuda ──
--     `trg_deuda_tc` corre en cada DELETE de `transacciones` y **lanza** si la
--     fila no tiene reparto guardado (`aplicado_*` en NULL). Una cuenta con
--     filas anteriores al backfill no se podría borrar nunca. Para eso existe
--     `vorta.reparto_manual`: las tarjetas se van en la misma operación, así
--     que mantener sus columnas de deuda al día mientras se borran no tiene
--     sentido. `set_config(..., true)` es local a la transacción.
--
--     `security definer` porque un cliente no puede tocar `auth.users`, y
--     todo está scopeado por `auth.uid()`: la función solo puede borrar la
--     cuenta de quien la llama. `auth.users` se califica con el esquema en
--     lugar de meter `auth` en el `search_path`.
--
--     Devuelve el conteo de filas borradas por tabla. Sirve para dos cosas:
--     que el cliente pueda mostrar qué se fue, y que un test pueda afirmar
--     que no quedó nada — un `void` no se puede verificar.
-- ══════════════════════════════════════════════════════════════════════

create or replace function borrar_mi_cuenta()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_conteo jsonb := '{}'::jsonb;
  v_tabla  text;
  v_filas  bigint;
begin
  if v_uid is null then
    raise exception 'borrar_mi_cuenta requiere una sesión autenticada';
  end if;

  -- El orden importa: las hijas antes que las padres. `transacciones` primero
  -- porque referencia a cuentas (restrict), tarjetas y ciclos.
  perform set_config('vorta.reparto_manual', 'on', true);

  foreach v_tabla in array array[
    'transacciones',          -- → cuentas (restrict), tarjetas, ciclos
    'pagos_recurrentes',      -- → cuentas (restrict)
    'inversiones_historial',  -- → inversiones
    'ciclos_tc',              -- → tarjetas_credito
    'presupuestos',
    'metas_ahorro',
    'categorias_usuario',
    'inversiones',
    'cuentas',
    'tarjetas_credito',
    'profiles'
  ]
  loop
    execute format('delete from public.%I where user_id = $1', v_tabla) using v_uid;
    get diagnostics v_filas = row_count;
    v_conteo := v_conteo || jsonb_build_object(v_tabla, v_filas);
  end loop;

  perform set_config('vorta.reparto_manual', 'off', true);

  -- Al final el usuario de Auth. Lo que queda colgando de él en el esquema
  -- `auth` (identidades, sesiones, refresh tokens) sí es cascade de Supabase.
  delete from auth.users where id = v_uid;
  get diagnostics v_filas = row_count;
  v_conteo := v_conteo || jsonb_build_object('auth_users', v_filas);

  return v_conteo;
end;
$$;

-- Solo el dueño de la sesión puede llamarla, y solo borra lo suyo. `public`
-- (anon) no tiene nada que borrar: sin `auth.uid()` la función lanza.
revoke all on function borrar_mi_cuenta() from public;
grant execute on function borrar_mi_cuenta() to authenticated;
