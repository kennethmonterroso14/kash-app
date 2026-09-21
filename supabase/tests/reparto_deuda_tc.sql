-- ══════════════════════════════════════════════════════════════════════
-- Tarea 1.5.4 — El reparto de deuda de TC, contra Postgres de verdad.
--
-- Se prueba el trigger `trg_deuda_tc` (y `cerrar_ciclo_tc`), no un mock: lo
-- que hay que verificar es lo que hace la base. De acá salieron los tres
-- defectos críticos de la auditoría, y el más caro fue justamente un delta mal
-- aplicado que después no se pudo reconstruir.
--
-- Cada bloque usa `assert`, así que el script FALLA con error si algo no
-- cuadra. Correr con -v ON_ERROR_STOP=1; sin salida de error = todo pasó.
-- Ver supabase/tests/README.md.
-- ══════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

-- ── Escenario ─────────────────────────────────────────────────────────
-- `cerrar_ciclo_tc` exige una sesión autenticada y opera sobre auth.uid(): esa
-- es la protección que evita que un usuario cierre el ciclo de otro. Acá se
-- simula el claim del JWT que Supabase inyecta.
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');

insert into profiles (user_id, nombre)
values ('11111111-1111-1111-1111-111111111111', 'Test');

insert into cuentas (id, user_id, nombre, tipo, saldo, color)
values ('22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111', 'Cuenta', 'ahorro', 0, '#fff');

insert into tarjetas_credito (
  id, user_id, nombre, limite_credito, deuda_actual, deuda_ciclo_anterior,
  dia_cierre, dia_pago, color
) values (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111', 'TC Test', 1000000, 0, 0,
  15, 5, '#fff'
);

-- ── 1. Un cargo engorda el ciclo ABIERTO, nunca el anterior ───────────
do $$
declare v_ant bigint; v_act bigint; v_rep_ant bigint; v_rep_act bigint;
begin
  insert into transacciones (id, user_id, cuenta_id, tarjeta_id, fecha, cantidad, descripcion, categoria, tipo)
  values ('44444444-0000-0000-0000-000000000001',
          '11111111-1111-1111-1111-111111111111', null,
          '33333333-3333-3333-3333-333333333333',
          current_date, -50000, 'Cargo A', 'Otros', 'gasto_tc');

  select deuda_ciclo_anterior, deuda_actual into v_ant, v_act
    from tarjetas_credito where id = '33333333-3333-3333-3333-333333333333';
  assert v_ant = 0,     format('cargo: ciclo anterior debía quedar en 0, quedó %s', v_ant);
  assert v_act = 50000, format('cargo: ciclo actual debía quedar en 50000, quedó %s', v_act);

  -- El reparto se PERSISTE en la fila: sin eso un delete no puede revertirlo.
  select aplicado_ciclo_anterior, aplicado_actual into v_rep_ant, v_rep_act
    from transacciones where id = '44444444-0000-0000-0000-000000000001';
  assert v_rep_ant = 0,     format('cargo: reparto anterior debía ser 0, fue %s', v_rep_ant);
  assert v_rep_act = 50000, format('cargo: reparto actual debía ser 50000, fue %s', v_rep_act);
end $$;

-- ── 2. Cerrar el ciclo mueve la deuda de un bucket al otro ────────────
do $$
declare v_ant bigint; v_act bigint; v_abiertos int;
begin
  perform cerrar_ciclo_tc('33333333-3333-3333-3333-333333333333');

  select deuda_ciclo_anterior, deuda_actual into v_ant, v_act
    from tarjetas_credito where id = '33333333-3333-3333-3333-333333333333';
  assert v_ant = 50000, format('cierre: la deuda debía pasar a vencida, anterior=%s', v_ant);
  assert v_act = 0,     format('cierre: el ciclo abierto debía reiniciar en 0, actual=%s', v_act);

  -- Exactamente un ciclo abierto por tarjeta: los ciclos duplicados al cerrar
  -- fueron uno de los defectos corregidos.
  select count(*) into v_abiertos from ciclos_tc
   where tarjeta_id = '33333333-3333-3333-3333-333333333333' and estado = 'abierto';
  assert v_abiertos = 1, format('cierre: debía quedar 1 ciclo abierto, hay %s', v_abiertos);
end $$;

-- ── 3. Un cargo nuevo va al ciclo abierto, sin tocar el vencido ───────
do $$
declare v_ant bigint; v_act bigint;
begin
  insert into transacciones (id, user_id, cuenta_id, tarjeta_id, fecha, cantidad, descripcion, categoria, tipo)
  values ('44444444-0000-0000-0000-000000000002',
          '11111111-1111-1111-1111-111111111111', null,
          '33333333-3333-3333-3333-333333333333',
          current_date, -30000, 'Cargo B', 'Otros', 'gasto_tc');

  select deuda_ciclo_anterior, deuda_actual into v_ant, v_act
    from tarjetas_credito where id = '33333333-3333-3333-3333-333333333333';
  assert v_ant = 50000, format('cargo tras cierre: el vencido no debía moverse, es %s', v_ant);
  assert v_act = 30000, format('cargo tras cierre: el abierto debía ser 30000, es %s', v_act);
end $$;

-- ── 4. Un pago liquida PRIMERO el vencido y el sobrante baja el abierto ─
do $$
declare v_ant bigint; v_act bigint; v_rep_ant bigint; v_rep_act bigint;
begin
  -- Q600 contra Q500 vencidos + Q300 abiertos → 500 al vencido, 100 al abierto.
  insert into transacciones (id, user_id, cuenta_id, tarjeta_id, fecha, cantidad, descripcion, categoria, tipo)
  values ('44444444-0000-0000-0000-000000000003',
          '11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222',
          '33333333-3333-3333-3333-333333333333',
          current_date, -60000, 'Pago', 'Pago Deudas', 'pago_tc');

  select deuda_ciclo_anterior, deuda_actual into v_ant, v_act
    from tarjetas_credito where id = '33333333-3333-3333-3333-333333333333';
  assert v_ant = 0,     format('pago: el vencido debía liquidarse, quedó %s', v_ant);
  assert v_act = 20000, format('pago: el abierto debía bajar a 20000, quedó %s', v_act);

  select aplicado_ciclo_anterior, aplicado_actual into v_rep_ant, v_rep_act
    from transacciones where id = '44444444-0000-0000-0000-000000000003';
  assert v_rep_ant = -50000, format('pago: reparto anterior debía ser -50000, fue %s', v_rep_ant);
  assert v_rep_act = -10000, format('pago: reparto actual debía ser -10000, fue %s', v_rep_act);
end $$;

-- ── 5. Borrar el pago revierte EXACTAMENTE el reparto guardado ────────
do $$
declare v_ant bigint; v_act bigint;
begin
  delete from transacciones where id = '44444444-0000-0000-0000-000000000003';

  select deuda_ciclo_anterior, deuda_actual into v_ant, v_act
    from tarjetas_credito where id = '33333333-3333-3333-3333-333333333333';
  -- Vuelve al estado previo al pago, no a un recálculo desde `cantidad`:
  -- reconstruirlo desde el monto no sabría cómo se había repartido.
  assert v_ant = 50000, format('delete pago: el vencido debía volver a 50000, quedó %s', v_ant);
  assert v_act = 30000, format('delete pago: el abierto debía volver a 30000, quedó %s', v_act);
end $$;

-- ── 6. Borrar un cargo revierte su propio delta ───────────────────────
do $$
declare v_ant bigint; v_act bigint;
begin
  delete from transacciones where id = '44444444-0000-0000-0000-000000000002';

  select deuda_ciclo_anterior, deuda_actual into v_ant, v_act
    from tarjetas_credito where id = '33333333-3333-3333-3333-333333333333';
  assert v_ant = 50000, format('delete cargo: el vencido no debía moverse, es %s', v_ant);
  assert v_act = 0,     format('delete cargo: el abierto debía volver a 0, es %s', v_act);
end $$;

-- ── 7. Un pago que EXCEDE la deuda se recorta, no deja negativos ──────
do $$
declare v_ant bigint; v_act bigint; v_rep_ant bigint; v_rep_act bigint;
begin
  -- Q900 contra Q500 vencidos y Q0 abiertos: solo 500 se aplican.
  insert into transacciones (id, user_id, cuenta_id, tarjeta_id, fecha, cantidad, descripcion, categoria, tipo)
  values ('44444444-0000-0000-0000-000000000004',
          '11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222',
          '33333333-3333-3333-3333-333333333333',
          current_date, -90000, 'Pago de más', 'Pago Deudas', 'pago_tc');

  select deuda_ciclo_anterior, deuda_actual into v_ant, v_act
    from tarjetas_credito where id = '33333333-3333-3333-3333-333333333333';
  assert v_ant = 0, format('sobrepago: el vencido debía quedar en 0, quedó %s', v_ant);
  assert v_act = 0, format('sobrepago: el abierto debía quedar en 0, quedó %s', v_act);

  select aplicado_ciclo_anterior, aplicado_actual into v_rep_ant, v_rep_act
    from transacciones where id = '44444444-0000-0000-0000-000000000004';
  -- Se guarda lo APLICADO (-500), no el monto pagado (-900): si no, el delete
  -- devolvería Q400 de deuda que nunca existió.
  assert v_rep_ant = -50000, format('sobrepago: reparto anterior debía ser -50000, fue %s', v_rep_ant);
  assert v_rep_act = 0,      format('sobrepago: reparto actual debía ser 0, fue %s', v_rep_act);
end $$;

-- ── 8. Y borrarlo devuelve solo lo que se había aplicado ──────────────
do $$
declare v_ant bigint; v_act bigint;
begin
  delete from transacciones where id = '44444444-0000-0000-0000-000000000004';

  select deuda_ciclo_anterior, deuda_actual into v_ant, v_act
    from tarjetas_credito where id = '33333333-3333-3333-3333-333333333333';
  assert v_ant = 50000, format('delete sobrepago: debía devolver 50000, quedó %s', v_ant);
  assert v_act = 0,     format('delete sobrepago: el abierto debía seguir en 0, es %s', v_act);
end $$;

-- ── 9. Una fila SIN reparto registrado se rechaza, no se adivina ──────
do $$
declare v_falló boolean := false;
begin
  -- Se simula una fila anterior a la migración poniendo el reparto en NULL con
  -- el escape hatch, que es la única vía para no disparar el recálculo.
  insert into transacciones (id, user_id, cuenta_id, tarjeta_id, fecha, cantidad, descripcion, categoria, tipo)
  values ('44444444-0000-0000-0000-000000000005',
          '11111111-1111-1111-1111-111111111111', null,
          '33333333-3333-3333-3333-333333333333',
          current_date, -10000, 'Legado', 'Otros', 'gasto_tc');

  perform set_config('vorta.reparto_manual', 'on', true);
  update transacciones
     set aplicado_ciclo_anterior = null, aplicado_actual = null
   where id = '44444444-0000-0000-0000-000000000005';
  perform set_config('vorta.reparto_manual', 'off', true);

  begin
    delete from transacciones where id = '44444444-0000-0000-0000-000000000005';
  exception when others then
    v_falló := true;
  end;

  -- Adivinar el reparto puede borrar deuda real, así que se rechaza.
  assert v_falló, 'una fila sin reparto registrado debía rechazar el DELETE y no lo hizo';
end $$;

-- ── 10. El escape hatch es LOCAL a la transacción ─────────────────────
do $$
begin
  assert coalesce(current_setting('vorta.reparto_manual', true), 'off') <> 'on',
    'el escape hatch quedó encendido: set_config(..., true) debía ser local';
end $$;

rollback;
