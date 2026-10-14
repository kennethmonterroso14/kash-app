-- ══════════════════════════════════════════════════════════════════════
-- Cuentas en dólares: la columna, y Apple Pay convirtiendo el importe a la
-- moneda de la cuenta destino con el tipo de cambio del perfil (Q7.75).
--
-- Corre también la migración real encima del esquema: tiene que ser idempotente.
-- ══════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

\i :raiz/supabase/migrations/20261014000000_cuentas_moneda.sql

grant usage on schema public to anon;

insert into auth.users (id) values ('aaaaaaaa-0000-0000-0000-000000000001');
insert into profiles (user_id, nombre) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Ana');
insert into cuentas (id, user_id, nombre, tipo, saldo, color) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'BAC Quetzales', 'corriente', 0, '#fff');
insert into cuentas (id, user_id, nombre, tipo, saldo, color, moneda) values
  ('c3333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001', 'BI Dólares', 'ahorro', 0, '#fff', 'USD');
insert into tarjetas_credito (id, user_id, nombre, limite_credito, deuda_actual, deuda_ciclo_anterior, dia_cierre, dia_pago, color)
values ('c2222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'Visa Ysi', 1000000, 0, 0, 15, 5, '#fff');
insert into atajo_claves (user_id, clave_hash) values ('aaaaaaaa-0000-0000-0000-000000000001', encode(sha256('clave-ana'), 'hex'));
insert into atajo_tarjetas (user_id, nombre_wallet, cuenta_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Débito USD', 'c3333333-3333-3333-3333-333333333333');
insert into atajo_tarjetas (user_id, nombre_wallet, tarjeta_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Visa', 'c2222222-2222-2222-2222-222222222222');

create function pg_temp.exigir(p_ok boolean, p_que text) returns void
language plpgsql as $$ begin if not p_ok then raise exception 'FALLO: %', p_que; end if; end $$;
create function pg_temp.pago(p_centavos bigint, p_comercio text, p_tarjeta text, p_moneda text) returns jsonb
language sql as $$ select registrar_pago_atajo(encode(sha256('clave-ana'), 'hex'), p_centavos, p_comercio, p_tarjeta, p_moneda) $$;
create function pg_temp.saldo_usd() returns bigint language sql as
$$ select saldo from cuentas where id = 'c3333333-3333-3333-3333-333333333333' $$;
grant execute on all functions in schema pg_temp to anon;

-- ── La columna ────────────────────────────────────────────────────────
select pg_temp.exigir((select moneda from cuentas where id = 'c1111111-1111-1111-1111-111111111111') = 'GTQ', 'por defecto, quetzales');
do $$ begin
  update cuentas set moneda = 'EUR' where id = 'c1111111-1111-1111-1111-111111111111';
  raise exception 'FALLO: aceptó EUR';
exception when check_violation then null;
end $$;

-- ── Apple Pay en quetzales a una cuenta en dólares: se convierte ─────
set local role anon;
select pg_temp.exigir(
  pg_temp.pago(4500, 'Walmart', 'Débito USD', 'GTQ')
    @> '{"ok": true, "codigo": "registrado", "centavos": 581, "moneda": "USD", "centavos_original": 4500, "moneda_original": "GTQ"}',
  'Q45.00 → US$5.81 en la cuenta en dólares');
-- El atajo reintenta: se detecta como duplicado con el monto YA convertido.
select pg_temp.exigir(pg_temp.pago(4500, 'Walmart', 'Débito USD', 'GTQ') ->> 'codigo' = 'duplicado', 'duplicado tras convertir');
-- En dólares a la cuenta en dólares, o sin moneda: tal cual.
select pg_temp.exigir(pg_temp.pago(1000, 'Amazon', 'Débito USD', 'USD') @> '{"centavos": 1000, "moneda": "USD"}', 'USD a USD, sin convertir');
select pg_temp.exigir(not (pg_temp.pago(700, 'Uber', 'Débito USD', null) ? 'centavos_original'), 'sin moneda, sin convertir');
-- En dólares a una tarjeta en quetzales: se convierte al revés.
select pg_temp.exigir(pg_temp.pago(2000, 'Netflix', 'Visa', 'USD') @> '{"centavos": 15500, "moneda": "GTQ"}', 'US$20 → Q155 en la tarjeta');
-- La versión de 4 parámetros sigue respondiendo (sin conversión).
select pg_temp.exigir(registrar_pago_atajo(encode(sha256('clave-ana'), 'hex'), 300, 'Café', 'Visa') ->> 'codigo' = 'registrado', 'la versión de 4 parámetros');
reset role;

select pg_temp.exigir(pg_temp.saldo_usd() = -(581 + 1000 + 700), 'el saldo en dólares bajó en dólares');
select pg_temp.exigir((select cantidad from transacciones where descripcion = 'Walmart') = -581, 'una sola fila de Walmart, en dólares');
select pg_temp.exigir((select count(*) from transacciones where descripcion = 'Walmart') = 1, 'sin duplicar');
select pg_temp.exigir((select deuda_actual from tarjetas_credito where id = 'c2222222-2222-2222-2222-222222222222') = 15500 + 300,
  'la tarjeta subió en quetzales');

-- ── Sin tipo de cambio no se inventa una conversión ───────────────────
update profiles set tipo_cambio_usd = 0 where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
set local role anon;
select pg_temp.exigir(pg_temp.pago(4500, 'Super', 'Débito USD', 'GTQ') ->> 'codigo' = 'sin_tipo_cambio', 'sin tipo de cambio');
select pg_temp.exigir(pg_temp.pago(4500, 'Super', 'Débito USD', 'USD') ->> 'codigo' = 'registrado', 'en su moneda sí se registra');
reset role;

-- ── Ni anon ni una sesión leen o llaman lo que no deben ──────────────
select pg_temp.exigir(not has_function_privilege('authenticated', 'registrar_pago_atajo(text,bigint,text,text,text)', 'execute'), 'authenticated no');
select pg_temp.exigir(has_function_privilege('anon', 'registrar_pago_atajo(text,bigint,text,text,text)', 'execute'), 'anon sí');

rollback;
