-- ══════════════════════════════════════════════════════════════════════
-- Pagos de Apple Pay "por categorizar" y categorizar_pago().
--
-- Lo que se prueba es lo que justifica el RPC: cambiar la categoría de un
-- cargo de tarjeta DESPUÉS de cerrar su ciclo no puede mover la deuda de
-- bucket (un UPDATE normal la pasaría de deuda_ciclo_anterior a
-- deuda_actual). También: que cada pago del atajo quede marcado, que la marca
-- se vaya al categorizar o al borrar el movimiento, y que solo el dueño pueda.
-- ══════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

\i :raiz/supabase/migrations/20260926000000_atajo_por_categorizar.sql

grant usage on schema public, auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;

insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002');
insert into profiles (user_id, nombre) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Ana'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Beto');
insert into cuentas (id, user_id, nombre, tipo, saldo, color) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'BAC Débito', 'corriente', 100000, '#fff');
insert into tarjetas_credito (id, user_id, nombre, limite_credito, deuda_actual, deuda_ciclo_anterior, dia_cierre, dia_pago, color)
values ('c2222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'Visa Ysi', 1000000, 0, 0, 15, 5, '#fff');
insert into atajo_claves (user_id, clave_hash) values
  ('aaaaaaaa-0000-0000-0000-000000000001', encode(sha256('clave-ana'), 'hex'));
insert into atajo_tarjetas (user_id, nombre_wallet, cuenta_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Débito', 'c1111111-1111-1111-1111-111111111111');
insert into atajo_tarjetas (user_id, nombre_wallet, tarjeta_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Visa', 'c2222222-2222-2222-2222-222222222222');

create function pg_temp.exigir(p_ok boolean, p_que text) returns void
language plpgsql as $$ begin if not p_ok then raise exception 'FALLO: %', p_que; end if; end $$;
create function pg_temp.txn(p_desc text) returns uuid language sql as
$$ select id from transacciones where descripcion = p_desc $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- ── Dos pagos por el atajo: los dos quedan por categorizar ────────────
set local role anon;
select pg_temp.exigir(registrar_pago_atajo(encode(sha256('clave-ana'), 'hex'), 4500, 'Walmart', 'Débito') ->> 'por_categorizar' = 'true', 'la respuesta avisa');
select registrar_pago_atajo(encode(sha256('clave-ana'), 'hex'), 20000, 'Amazon', 'Visa');
reset role;
select pg_temp.exigir((select count(*) from pagos_por_categorizar) = 2, 'dos marcas');
select pg_temp.exigir((select categoria from transacciones where descripcion = 'Walmart') = 'Otros', 'mientras tanto, la sugerida');

-- ── El ciclo de la tarjeta cierra: el cargo pasa a deuda_ciclo_anterior ─
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
select cerrar_ciclo_tc('c2222222-2222-2222-2222-222222222222');
select pg_temp.exigir((select deuda_ciclo_anterior = 20000 and deuda_actual = 0 from tarjetas_credito
                        where id = 'c2222222-2222-2222-2222-222222222222'), 'el cierre movió el cargo');

-- ── Ana categoriza, con su sesión y bajo RLS ──────────────────────────
set local role authenticated;
select pg_temp.exigir(categorizar_pago(pg_temp.txn('Walmart'), 'Supermercado'), 'categorizar el gasto de cuenta');
select pg_temp.exigir(categorizar_pago(pg_temp.txn('Amazon'), ' Ropa/Personal '), 'categorizar el cargo de tarjeta');
reset role;
select pg_temp.exigir((select categoria from transacciones where descripcion = 'Walmart') = 'Supermercado', 'categoría del gasto');
select pg_temp.exigir((select categoria from transacciones where descripcion = 'Amazon') = 'Ropa/Personal', 'categoría del cargo, recortada');
select pg_temp.exigir((select deuda_ciclo_anterior = 20000 and deuda_actual = 0 from tarjetas_credito
                        where id = 'c2222222-2222-2222-2222-222222222222'), 'la deuda NO cambió de bucket');
select pg_temp.exigir((select saldo from cuentas where id = 'c1111111-1111-1111-1111-111111111111') = 95500, 'el saldo no se movió al categorizar');
select pg_temp.exigir((select count(*) from pagos_por_categorizar) = 0, 'sin marcas pendientes');
select pg_temp.exigir(current_setting('vorta.reparto_manual', true) = 'off', 'el escape del trigger quedó apagado');

-- ── Borrar el movimiento borra la marca ───────────────────────────────
set local role anon;
select registrar_pago_atajo(encode(sha256('clave-ana'), 'hex'), 1500, 'Café', 'Débito');
reset role;
delete from transacciones where descripcion = 'Café';
select pg_temp.exigir((select count(*) from pagos_por_categorizar) = 0, 'la marca se fue con el movimiento');

-- ── Otra persona no categoriza lo de Ana; anon tampoco ───────────────
set local role anon;
select registrar_pago_atajo(encode(sha256('clave-ana'), 'hex'), 3000, 'Uber', 'Débito');
reset role;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
set local role authenticated;
select pg_temp.exigir(not categorizar_pago(pg_temp.txn('Uber'), 'Transporte'), 'Beto no puede');
reset role;
select pg_temp.exigir((select categoria from transacciones where descripcion = 'Uber') = 'Otros', 'la categoría de Ana no cambió');
select pg_temp.exigir((select count(*) from pagos_por_categorizar) = 1, 'la marca de Ana sigue');
select pg_temp.exigir(not has_function_privilege('anon', 'categorizar_pago(uuid,text)', 'execute'), 'anon no la ejecuta');

-- ── Una categoría vacía se rechaza ────────────────────────────────────
do $$ begin
  perform categorizar_pago(pg_temp.txn('Uber'), '   ');
  raise exception 'FALLO: aceptó una categoría vacía';
exception when raise_exception then
  if sqlerrm like 'FALLO%' then raise; end if;
end $$;

rollback;
