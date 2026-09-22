-- ══════════════════════════════════════════════════════════════════════
-- Tarea 2.2 — `borrar_mi_cuenta()`: que no quede nada, y solo lo mío.
--
-- Es requisito de App Store, y es la operación más irreversible de la app, así
-- que lo que se prueba son las dos cosas que pueden salir mal de verdad:
--   · que quede algo (un borrado a medias deja datos de un usuario que cree
--     que se fue, y filas huérfanas que nadie puede leer por RLS);
--   · que se lleve algo de otro usuario.
--
-- El escenario llena LAS ONCE tablas a propósito: un `delete` que falta se
-- detecta solo si la tabla tenía filas.
--
-- Nota medida por mutación, contra lo que suponía el plan: un `delete from
-- auth.users` pelado SÍ se lleva las once tablas por cascada. Lo que obliga al
-- RPC es el bloque 5 — el trigger de deuda lanza si una fila no tiene reparto
-- guardado, y apagarlo necesita `set_config`, o sea una función. Ese bloque es
-- el que carga el peso de esta tarea; los demás verifican que el borrado sea
-- completo y ajeno.
--
-- Correr con -v ON_ERROR_STOP=1; sin salida de error = todo pasó.
-- ══════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

-- ── Dos usuarios: el que se va y el que se queda ──────────────────────
insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002');

-- Llena las once tablas para un usuario.
create or replace function pg_temp.sembrar(p_uid uuid, p_sufijo text) returns void
language plpgsql as $$
declare
  v_cuenta  uuid := (p_sufijo || '1111111-1111-1111-1111-111111111111')::uuid;
  v_tc      uuid := (p_sufijo || '2222222-2222-2222-2222-222222222222')::uuid;
  v_ciclo   uuid := (p_sufijo || '3333333-3333-3333-3333-333333333333')::uuid;
  v_inv     uuid := (p_sufijo || '4444444-4444-4444-4444-444444444444')::uuid;
begin
  insert into profiles (user_id, nombre) values (p_uid, 'U' || p_sufijo);

  insert into cuentas (id, user_id, nombre, tipo, saldo, color)
  values (v_cuenta, p_uid, 'Cuenta', 'ahorro', 0, '#fff');

  insert into tarjetas_credito (id, user_id, nombre, limite_credito, deuda_actual,
                                deuda_ciclo_anterior, dia_cierre, dia_pago, color)
  values (v_tc, p_uid, 'TC', 1000000, 0, 0, 15, 5, '#fff');

  insert into ciclos_tc (id, tarjeta_id, user_id, fecha_inicio, fecha_cierre, fecha_pago, estado)
  values (v_ciclo, v_tc, p_uid, date '2026-09-01', date '2026-09-15', date '2026-10-05', 'abierto');

  -- Un movimiento de cada clase que toca una FK no-cascade.
  insert into transacciones (user_id, cuenta_id, fecha, cantidad, descripcion, categoria, tipo)
  values (p_uid, v_cuenta, date '2026-09-10', -5000, 'gasto', 'Otros', 'gasto');
  insert into transacciones (user_id, cuenta_id, tarjeta_id, ciclo_id, fecha, cantidad, descripcion, categoria, tipo)
  values (p_uid, null, v_tc, v_ciclo, date '2026-09-11', -3000, 'cargo', 'Otros', 'gasto_tc');
  insert into transacciones (user_id, cuenta_id, tarjeta_id, ciclo_id, fecha, cantidad, descripcion, categoria, tipo)
  values (p_uid, v_cuenta, v_tc, null, date '2026-09-12', -1000, 'pago', 'Pago Deudas', 'pago_tc');

  insert into pagos_recurrentes (user_id, nombre, monto, dia_del_mes, cuenta_id, categoria)
  values (p_uid, 'Netflix', 9900, 5, v_cuenta, 'Suscripciones');

  insert into presupuestos (user_id, categoria, monto_limite, mes)
  values (p_uid, 'Supermercado', 200000, date '2026-09-01');

  insert into metas_ahorro (user_id, nombre, monto_objetivo, monto_actual)
  values (p_uid, 'Fondo', 1000000, 0);

  insert into categorias_usuario (user_id, nombre, tipo, color)
  values (p_uid, 'Médico', 'gasto', '#fff');

  insert into inversiones (id, user_id, nombre, tipo, monto_invertido, valor_actual,
                           moneda, fecha_inicio)
  values (v_inv, p_uid, 'Fondo HAPI', 'fondo', 500000, 500000, 'GTQ', date '2026-01-15');

  insert into inversiones_historial (inversion_id, user_id, valor, fecha)
  values (v_inv, p_uid, 500000, date '2026-01-15');
end $$;

-- Cuenta las filas de un usuario en las once tablas.
create or replace function pg_temp.filas(p_uid uuid) returns bigint
language plpgsql as $$
declare v_t text; v_n bigint; v_total bigint := 0;
begin
  foreach v_t in array array[
    'profiles','cuentas','tarjetas_credito','ciclos_tc','transacciones',
    'presupuestos','metas_ahorro','pagos_recurrentes','categorias_usuario',
    'inversiones','inversiones_historial'
  ] loop
    execute format('select count(*) from public.%I where user_id = $1', v_t)
      into v_n using p_uid;
    v_total := v_total + v_n;
  end loop;
  return v_total;
end $$;

do $$
begin
  perform pg_temp.sembrar('aaaaaaaa-0000-0000-0000-000000000001', 'a');
  perform pg_temp.sembrar('bbbbbbbb-0000-0000-0000-000000000002', 'b');
end $$;

-- ── 1. El escenario arranca con datos en las once tablas ──────────────
do $$
declare v_a bigint; v_b bigint; v_vacias int;
begin
  v_a := pg_temp.filas('aaaaaaaa-0000-0000-0000-000000000001');
  v_b := pg_temp.filas('bbbbbbbb-0000-0000-0000-000000000002');
  assert v_a = 13, format('el usuario A debía arrancar con 13 filas, tiene %s', v_a);
  assert v_b = 13, format('el usuario B debía arrancar con 13 filas, tiene %s', v_b);

  -- Y ninguna tabla quedó vacía: un `delete` que falta solo se detecta si la
  -- tabla tenía algo.
  select count(*) into v_vacias from (
    select 'profiles' t, count(*) n from profiles union all
    select 'cuentas', count(*) from cuentas union all
    select 'tarjetas_credito', count(*) from tarjetas_credito union all
    select 'ciclos_tc', count(*) from ciclos_tc union all
    select 'transacciones', count(*) from transacciones union all
    select 'presupuestos', count(*) from presupuestos union all
    select 'metas_ahorro', count(*) from metas_ahorro union all
    select 'pagos_recurrentes', count(*) from pagos_recurrentes union all
    select 'categorias_usuario', count(*) from categorias_usuario union all
    select 'inversiones', count(*) from inversiones union all
    select 'inversiones_historial', count(*) from inversiones_historial
  ) z where n = 0;
  assert v_vacias = 0, format('%s tabla(s) quedaron vacías: el test no probaría su delete', v_vacias);
end $$;

-- ── 2. Sin sesión, se rinde ───────────────────────────────────────────
do $$
declare v_fallo boolean := false;
begin
  begin
    perform borrar_mi_cuenta();
  exception when others then
    v_fallo := true;
    assert sqlerrm like '%sesión autenticada%',
      format('el error debía hablar de la sesión, dice: %s', sqlerrm);
  end;
  assert v_fallo, 'sin auth.uid() la función NO puede borrar nada';
end $$;

-- ── 3. Borra TODO lo del usuario A ────────────────────────────────────
do $$
declare v_conteo jsonb; v_a bigint; v_auth int;
begin
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  v_conteo := borrar_mi_cuenta();

  v_a := pg_temp.filas('aaaaaaaa-0000-0000-0000-000000000001');
  assert v_a = 0, format('quedaron %s filas del usuario borrado: %s', v_a, v_conteo);

  select count(*) into v_auth from auth.users
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert v_auth = 0, 'la fila de auth.users tiene que irse también';

  -- El conteo tiene que reportar las once tablas más auth: un `void` no se
  -- puede verificar, y el cliente muestra qué se fue.
  assert (select count(*) from jsonb_object_keys(v_conteo)) = 12,
    format('el conteo debía traer 12 claves (11 tablas + auth), trae %s: %s',
           (select count(*) from jsonb_object_keys(v_conteo)), v_conteo);
  assert (v_conteo->>'transacciones')::int = 3,
    format('debía reportar 3 transacciones, reportó %s', v_conteo->>'transacciones');
  assert (v_conteo->>'auth_users')::int = 1,
    format('debía reportar 1 usuario de auth, reportó %s', v_conteo->>'auth_users');
end $$;

-- ── 4. Y NO toca al otro usuario ──────────────────────────────────────
do $$
declare v_b bigint; v_auth int;
begin
  v_b := pg_temp.filas('bbbbbbbb-0000-0000-0000-000000000002');
  assert v_b = 13, format('el usuario B perdió filas: quedan %s de 13', v_b);
  select count(*) into v_auth from auth.users
   where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  assert v_auth = 1, 'el usuario B tiene que seguir existiendo en auth';
end $$;

-- ── 5. Una fila sin reparto guardado NO impide el borrado ─────────────
-- `trg_deuda_tc` LANZA al borrar un movimiento de TC sin `aplicado_*`. Sin el
-- escape hatch, una cuenta con filas anteriores al backfill no se podría
-- borrar nunca — y es justamente una cuenta vieja la que va a querer irse.
do $$
declare v_b bigint; v_fallo text := null;
begin
  perform set_config('vorta.reparto_manual', 'on', true);
  update transacciones
     set aplicado_ciclo_anterior = null, aplicado_actual = null
   where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'
     and tipo in ('gasto_tc', 'pago_tc');
  perform set_config('vorta.reparto_manual', 'off', true);

  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
  begin
    perform borrar_mi_cuenta();
  exception when others then
    v_fallo := sqlerrm;
  end;
  assert v_fallo is null,
    format('el borrado falló con filas sin reparto: %s', v_fallo);

  v_b := pg_temp.filas('bbbbbbbb-0000-0000-0000-000000000002');
  assert v_b = 0, format('quedaron %s filas del usuario B', v_b);
end $$;

-- ── 6. Borrar dos veces no explota ────────────────────────────────────
-- Un doble toque, o un reintento después de un timeout de red, no debe dar
-- error: la segunda vez simplemente no hay nada que borrar.
do $$
declare v_conteo jsonb;
begin
  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
  v_conteo := borrar_mi_cuenta();
  assert (v_conteo->>'auth_users')::int = 0,
    format('la segunda corrida no debía borrar nada, reportó %s', v_conteo);
end $$;

rollback;
