-- ══════════════════════════════════════════════════════════════════════
-- Acceso de asistentes de IA (sección 4b de schema.sql): con RLS DE VERDAD.
--
-- Los otros tests corren como superusuario, donde RLS no se evalúa. Este se
-- pone el rol `authenticated` con los claims de un JWT, como PostgREST, porque
-- lo que se prueba SON las policies:
--   · un asistente (claim `client_id`) lee y agrega, y el trigger de saldo
--     sigue moviendo la cuenta;
--   · sin el permiso de la persona no edita ni borra nada, ni cierra ciclos;
--   · con el permiso, sí; pero NUNCA toca `profiles` (se daría el permiso a
--     sí mismo) ni borra la cuenta;
--   · la sesión normal de la app no cambia.
--
-- Corre también la migración real encima del esquema: tiene que ser idempotente.
-- ══════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

\i :raiz/supabase/migrations/20260924000000_acceso_ia.sql

-- Lo que Supabase ya les da a sus roles.
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public, auth to authenticated;

insert into auth.users (id) values ('aaaaaaaa-0000-0000-0000-000000000001');
insert into profiles (user_id, nombre) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Ana');
insert into cuentas (id, user_id, nombre, tipo, saldo, color)
values ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'BI', 'ahorro', 0, '#fff');
insert into tarjetas_credito (id, user_id, nombre, limite_credito, deuda_actual, deuda_ciclo_anterior, dia_cierre, dia_pago, color)
values ('c2222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'TC', 1000000, 5000, 0, 15, 5, '#fff');
insert into transacciones (id, user_id, cuenta_id, fecha, cantidad, descripcion, categoria, tipo)
values ('c3333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001',
        'c1111111-1111-1111-1111-111111111111', date '2026-09-10', -5000, 'Café', 'Otros', 'gasto');

-- Afirma que una sentencia tocó exactamente `esperadas` filas.
create function pg_temp.filas(p_sql text, esperadas int, p_que text) returns void
language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  if n <> esperadas then
    raise exception 'FALLO: % tocó % fila(s), se esperaban %', p_que, n, esperadas;
  end if;
end $$;

-- Afirma que una sentencia lanza con un mensaje que contiene `p_msg`.
create function pg_temp.lanza(p_sql text, p_msg text, p_que text) returns void
language plpgsql as $$
declare ok boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    ok := sqlerrm like '%' || p_msg || '%';
  end;
  if not ok then raise exception 'FALLO: % debía rechazarse (%)', p_que, p_msg; end if;
end $$;

create function pg_temp.saldo() returns bigint language sql as
$$ select saldo from cuentas where id = 'c1111111-1111-1111-1111-111111111111' $$;

grant execute on all functions in schema pg_temp to authenticated;

-- ── 1. Asistente SIN permiso de modificar ─────────────────────────────
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated","client_id":"cliente-ia"}', true);
set local role authenticated;

do $$ begin
  if not public.es_acceso_ia() then raise exception 'FALLO: el token con client_id no se reconoce como IA'; end if;
end $$;

-- Lee y agrega; el trigger (security definer) mueve el saldo igual.
select pg_temp.filas($q$
  insert into transacciones (user_id, cuenta_id, fecha, cantidad, descripcion, categoria, tipo)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111', date '2026-09-11', 100000, 'Salario', 'Ingreso', 'ingreso')
$q$, 1, 'insertar un ingreso');
do $$ begin
  if pg_temp.saldo() <> -5000 + 100000 then raise exception 'FALLO: el insert de la IA no movió el saldo (%)', pg_temp.saldo(); end if;
end $$;
select pg_temp.filas($q$ select * from transacciones $q$, 2, 'leer movimientos');

-- No edita ni borra.
select pg_temp.filas($q$ update transacciones set descripcion = 'x' $q$, 0, 'editar movimientos sin permiso');
select pg_temp.filas($q$ delete from transacciones $q$, 0, 'borrar movimientos sin permiso');
select pg_temp.filas($q$ update cuentas set nombre = 'x' $q$, 0, 'editar cuentas sin permiso');
select pg_temp.filas($q$ delete from tarjetas_credito $q$, 0, 'borrar tarjetas sin permiso');
select pg_temp.filas($q$ update profiles set ia_puede_editar = true $q$, 0, 'darse el permiso a sí misma');
select pg_temp.lanza($q$ select cerrar_ciclo_tc('c2222222-2222-2222-2222-222222222222') $q$, 'asistente de IA', 'cerrar ciclo sin permiso');
select pg_temp.lanza($q$ select borrar_mi_cuenta() $q$, 'asistente de IA', 'borrar la cuenta');
do $$ begin
  if pg_temp.saldo() <> 95000 then raise exception 'FALLO: el saldo cambió sin permiso (%)', pg_temp.saldo(); end if;
end $$;

-- ── 2. La persona activa el permiso (desde la app) ────────────────────
reset role;
update profiles set ia_puede_editar = true where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
set local role authenticated;

select pg_temp.filas($q$ update transacciones set cantidad = -6000 where id = 'c3333333-3333-3333-3333-333333333333' $q$, 1, 'editar un movimiento con permiso');
do $$ begin
  if pg_temp.saldo() <> 94000 then raise exception 'FALLO: editar no ajustó el saldo (%)', pg_temp.saldo(); end if;
end $$;
select pg_temp.filas($q$ delete from transacciones where id = 'c3333333-3333-3333-3333-333333333333' $q$, 1, 'borrar un movimiento con permiso');
do $$ begin
  if pg_temp.saldo() <> 100000 then raise exception 'FALLO: borrar no revirtió el saldo (%)', pg_temp.saldo(); end if;
end $$;
select pg_temp.filas($q$ update cuentas set nombre = 'BI Ahorros' $q$, 1, 'editar una cuenta con permiso');
-- Con permiso o sin él: el perfil y la cuenta entera no.
select pg_temp.filas($q$ update profiles set nombre = 'x' $q$, 0, 'editar el perfil con permiso');
select pg_temp.filas($q$ delete from profiles $q$, 0, 'borrar el perfil con permiso');
select pg_temp.lanza($q$ select borrar_mi_cuenta() $q$, 'asistente de IA', 'borrar la cuenta con permiso');

-- ── 3. La sesión normal de la app (sin client_id) no cambia ───────────
reset role;
update profiles set ia_puede_editar = false where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

do $$ begin
  if public.es_acceso_ia() then raise exception 'FALLO: la sesión de la app se tomó por IA'; end if;
end $$;
select pg_temp.filas($q$ update transacciones set descripcion = 'editado en la app' $q$, 1, 'editar desde la app');
select pg_temp.filas($q$ update profiles set ia_puede_editar = true $q$, 1, 'activar el permiso desde la app');
select pg_temp.filas($q$ delete from transacciones $q$, 1, 'borrar desde la app');

reset role;
rollback;
