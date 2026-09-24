-- ══════════════════════════════════════════════════════════════════════
-- registrar_pago_atajo: un pago con Apple Pay desde el atajo del iPhone.
--
-- Se llama como `anon` (así llega desde /api/atajo) y se prueba cada regla
-- del diseño (docs/superpowers/specs/2026-09-25-apple-pay-atajo-design.md):
-- clave, tarjeta sin asignar, cuenta, tarjeta de crédito con y sin ciclo
-- abierto, categoría aprendida, doble disparo, destino archivado, y que la
-- clave de una persona nunca escriba en la de otra.
--
-- Corre también la migración real encima del esquema: tiene que ser idempotente.
-- ══════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

\i :raiz/supabase/migrations/20260925000000_atajo_apple_pay.sql

grant usage on schema public to anon;

insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002');
insert into profiles (user_id, nombre) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Ana'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Beto');
insert into cuentas (id, user_id, nombre, tipo, saldo, color) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'BAC Débito', 'corriente', 100000, '#fff'),
  ('c4444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001', 'Vieja', 'ahorro', 0, '#fff');
update cuentas set activa = false where id = 'c4444444-4444-4444-4444-444444444444';
insert into tarjetas_credito (id, user_id, nombre, limite_credito, deuda_actual, deuda_ciclo_anterior, dia_cierre, dia_pago, color)
values ('c2222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'Visa Ysi', 1000000, 0, 0, 15, 5, '#fff');
-- sha256('clave-ana') y sha256('clave-beto'), como las calcula /api/atajo.
insert into atajo_claves (user_id, clave_hash) values
  ('aaaaaaaa-0000-0000-0000-000000000001', encode(sha256('clave-ana'), 'hex')),
  ('bbbbbbbb-0000-0000-0000-000000000002', encode(sha256('clave-beto'), 'hex'));
insert into atajo_tarjetas (user_id, nombre_wallet, cuenta_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'BAC Débito', 'c1111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Tarjeta vieja', 'c4444444-4444-4444-4444-444444444444');
insert into atajo_tarjetas (user_id, nombre_wallet, tarjeta_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Visa BI', 'c2222222-2222-2222-2222-222222222222');
-- Un gasto anterior en el súper: la categoría se aprende de acá.
insert into transacciones (user_id, cuenta_id, fecha, cantidad, descripcion, categoria, tipo)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111',
        date '2026-09-01', -1000, 'Super La Torre', 'Supermercado', 'gasto');

create function pg_temp.pago(p_clave text, p_centavos bigint, p_comercio text, p_tarjeta text) returns jsonb
language sql as $$ select registrar_pago_atajo(encode(sha256(p_clave::bytea), 'hex'), p_centavos, p_comercio, p_tarjeta) $$;

create function pg_temp.exigir(p_ok boolean, p_que text) returns void
language plpgsql as $$ begin if not p_ok then raise exception 'FALLO: %', p_que; end if; end $$;

create function pg_temp.saldo() returns bigint language sql as
$$ select saldo from cuentas where id = 'c1111111-1111-1111-1111-111111111111' $$;

grant execute on all functions in schema pg_temp to anon;

set local role anon;

-- ── Clave y monto ─────────────────────────────────────────────────────
select pg_temp.exigir(pg_temp.pago('no-existe', 4500, 'x', 'BAC Débito') ->> 'codigo' = 'clave_invalida', 'clave inválida');
select pg_temp.exigir(pg_temp.pago('clave-ana', 0, 'x', 'BAC Débito') ->> 'codigo' = 'monto_invalido', 'monto cero');
select pg_temp.exigir(pg_temp.pago('clave-ana', 4500, 'x', '') ->> 'codigo' = 'sin_tarjeta', 'sin tarjeta');

-- ── A una cuenta: gasto con la categoría aprendida, saldo movido ─────
select pg_temp.exigir(
  pg_temp.pago('clave-ana', 4500, 'Super La Torre', 'bac débito') @> '{"ok": true, "codigo": "registrado", "categoria": "Supermercado", "destino": "BAC Débito"}',
  'pago a cuenta (nombre de Wallet sin distinguir mayúsculas)');
reset role;
select pg_temp.exigir(pg_temp.saldo() = 100000 - 1000 - 4500, 'el saldo de la cuenta bajó 45.00');
select pg_temp.exigir(exists (
  select 1 from transacciones
   where descripcion = 'Super La Torre' and cantidad = -4500 and tipo = 'gasto'
     and fecha = (now() at time zone 'America/Guatemala')::date
     and notas = 'Apple Pay · bac débito'), 'la fila del gasto, fechada hoy en la zona del perfil');
set local role anon;

-- ── El atajo reintenta: no se duplica ─────────────────────────────────
select pg_temp.exigir(pg_temp.pago('clave-ana', 4500, 'Super La Torre', 'BAC Débito') ->> 'codigo' = 'duplicado', 'doble disparo');
reset role;
select pg_temp.exigir((select count(*) from transacciones where descripcion = 'Super La Torre' and cantidad = -4500) = 1, 'una sola fila');
select pg_temp.exigir(pg_temp.saldo() = 94500, 'el saldo no se movió dos veces');
set local role anon;

-- ── Comercio nuevo: "Otros" ───────────────────────────────────────────
select pg_temp.exigir(pg_temp.pago('clave-ana', 2000, 'Café Barista', 'BAC Débito') ->> 'categoria' = 'Otros', 'categoría por defecto');

-- ── Tarjeta de crédito SIN ciclo abierto: lo abre y enlaza el cargo ──
select pg_temp.exigir(pg_temp.pago('clave-ana', 10000, 'Amazon', 'Visa BI') ->> 'codigo' = 'registrado', 'cargo a TC');
select pg_temp.exigir(pg_temp.pago('clave-ana', 5000, 'Uber', 'Visa BI') ->> 'codigo' = 'registrado', 'segundo cargo a TC');
reset role;
select pg_temp.exigir((select count(*) from ciclos_tc where tarjeta_id = 'c2222222-2222-2222-2222-222222222222' and estado = 'abierto') = 1,
  'un solo ciclo abierto, reutilizado');
select pg_temp.exigir(not exists (
  select 1 from transacciones where tarjeta_id = 'c2222222-2222-2222-2222-222222222222'
     and (tipo <> 'gasto_tc' or ciclo_id is null or cuenta_id is not null)), 'cargos gasto_tc, con ciclo y sin cuenta');
select pg_temp.exigir((select deuda_actual from tarjetas_credito where id = 'c2222222-2222-2222-2222-222222222222') = 15000,
  'la deuda de la tarjeta subió por el trigger');
set local role anon;

-- ── Tarjeta desconocida: no se registra y queda para asignar ─────────
select pg_temp.exigir(pg_temp.pago('clave-ana', 3000, 'Farmacia', 'Amex Nueva') @> '{"codigo": "tarjeta_sin_asignar", "tarjeta": "Amex Nueva"}', 'tarjeta nueva');
select pg_temp.exigir(pg_temp.pago('clave-ana', 3000, 'Farmacia', 'Amex Nueva') ->> 'codigo' = 'tarjeta_sin_asignar', 'sigue sin asignar');
reset role;
select pg_temp.exigir((select count(*) from atajo_tarjetas where nombre_wallet = 'Amex Nueva' and cuenta_id is null and tarjeta_id is null) = 1,
  'aparece una vez, sin destino');
select pg_temp.exigir(not exists (select 1 from transacciones where descripcion = 'Farmacia'), 'el pago no se registró');
set local role anon;

-- ── Destino archivado ─────────────────────────────────────────────────
select pg_temp.exigir(pg_temp.pago('clave-ana', 3000, 'x', 'Tarjeta vieja') ->> 'codigo' = 'destino_inactivo', 'cuenta archivada');

-- ── La clave de Beto no alcanza lo de Ana ─────────────────────────────
select pg_temp.exigir(pg_temp.pago('clave-beto', 3000, 'x', 'BAC Débito') ->> 'codigo' = 'tarjeta_sin_asignar', 'Beto no ve las tarjetas de Ana');
reset role;
select pg_temp.exigir(not exists (select 1 from transacciones where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'), 'nada escrito para Beto');
select pg_temp.exigir((select ultimo_uso is not null from atajo_claves where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'ultimo_uso se registra');

-- ── anon no lee las tablas, y una sesión no llama al RPC ─────────────
select pg_temp.exigir(not has_table_privilege('anon', 'atajo_claves', 'select')
  or not exists (select 1 from pg_policies where tablename = 'atajo_claves' and 'anon' = any(roles)), 'anon sin acceso a las claves');
select pg_temp.exigir(not has_function_privilege('authenticated', 'registrar_pago_atajo(text,bigint,text,text)', 'execute'), 'authenticated no la ejecuta');
select pg_temp.exigir(has_function_privilege('anon', 'registrar_pago_atajo(text,bigint,text,text)', 'execute'), 'anon sí');

rollback;
