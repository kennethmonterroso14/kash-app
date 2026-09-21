-- ══════════════════════════════════════════════════════════════════════
-- Tarea 4.2a — La deuda derivada del ledger reproduce al trigger.
--
-- Lo que se prueba es UNA propiedad, en cada escenario: que
-- `deuda_tc_derivada()` dé exactamente lo mismo que el total corriente que
-- mantiene `trg_deuda_tc`. Si coinciden en todos los caminos, el total
-- corriente se puede retirar (tarea 4.2b) sin cambiar ningún número.
--
-- No se comparan contra constantes escritas a mano: se comparan contra la
-- tarjeta. Un test con el número esperado cableado pasaría igual si las DOS
-- implementaciones estuvieran mal del mismo modo; comparar una contra la otra
-- es lo que detecta que se separaron.
--
-- Correr con -v ON_ERROR_STOP=1; sin salida de error = todo pasó.
-- ══════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
insert into profiles (user_id, nombre)
values ('11111111-1111-1111-1111-111111111111', 'Test 4.2');
insert into cuentas (id, user_id, nombre, tipo, saldo, color)
values ('22222222-4200-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'Cuenta', 'ahorro', 100000000, '#fff');

insert into tarjetas_credito (
  id, user_id, nombre, limite_credito, deuda_actual, deuda_ciclo_anterior,
  dia_cierre, dia_pago, color
) values (
  '33333333-4200-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111', 'TC 4.2', 10000000, 0, 0,
  15, 5, '#fff'
);
insert into ciclos_tc (id, tarjeta_id, user_id, fecha_inicio, fecha_cierre, fecha_pago, estado)
values ('55555555-4200-0000-0000-000000000001',
        '33333333-4200-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        date '2026-09-01', date '2026-09-15', date '2026-10-05', 'abierto');

-- Compara la tarjeta contra la derivación y falla nombrando el escenario.
create or replace function pg_temp.cuadra(p_paso text) returns void
language plpgsql as $$
declare
  v_g_ant bigint; v_g_act bigint;
  v_d_ant bigint; v_d_act bigint; v_ok boolean; v_motivo text;
begin
  select deuda_ciclo_anterior, deuda_actual into v_g_ant, v_g_act
    from tarjetas_credito where id = '33333333-4200-0000-0000-000000000001';
  select bucket_anterior, bucket_actual, derivable, motivo
    into v_d_ant, v_d_act, v_ok, v_motivo
    from deuda_tc_derivada('33333333-4200-0000-0000-000000000001');

  assert v_ok, format('%s: la derivación se rindió — %s', p_paso, v_motivo);
  assert v_g_ant = v_d_ant and v_g_act = v_d_act,
    format('%s: guardado (ant %s / act %s) ≠ derivado (ant %s / act %s)',
           p_paso, v_g_ant, v_g_act, v_d_ant, v_d_act);
end $$;

-- Inserta un movimiento de TC. `clock_timestamp()` explícito en created_at:
-- el default es `now()`, que dentro de este BEGIN es el mismo instante para
-- todas las filas, y acá el ORDEN de los eventos es justamente lo que se
-- prueba.
create or replace function pg_temp.mov(p_id uuid, p_tipo text, p_monto bigint) returns void
language plpgsql as $$
begin
  insert into transacciones (
    id, user_id, cuenta_id, tarjeta_id, ciclo_id, fecha, cantidad,
    descripcion, categoria, tipo, created_at
  ) values (
    p_id, '11111111-1111-1111-1111-111111111111',
    case when p_tipo = 'pago_tc' then '22222222-4200-0000-0000-000000000001'::uuid end,
    '33333333-4200-0000-0000-000000000001',
    -- A propósito NULL: la derivación no usa ciclo_id, y así el test lo prueba.
    null,
    date '2026-09-10', -p_monto, 'mov ' || p_tipo, 'Otros', p_tipo::tipo_transaccion,
    clock_timestamp()
  );
end $$;

-- ── 1. Un cargo ───────────────────────────────────────────────────────
do $$
begin
  perform pg_temp.mov('44444444-4200-0000-0000-000000000001', 'gasto_tc', 50000);
  perform pg_temp.cuadra('un cargo');
end $$;

-- ── 2. Varios cargos ──────────────────────────────────────────────────
do $$
begin
  perform pg_temp.mov('44444444-4200-0000-0000-000000000002', 'gasto_tc', 25000);
  perform pg_temp.mov('44444444-4200-0000-0000-000000000003', 'gasto_tc', 1234);
  perform pg_temp.cuadra('varios cargos');
end $$;

-- ── 3. Un pago parcial con un solo bucket ─────────────────────────────
do $$
begin
  perform pg_temp.mov('44444444-4200-0000-0000-000000000004', 'pago_tc', 20000);
  perform pg_temp.cuadra('pago parcial, un bucket');
end $$;

-- ── 4. Un cierre mueve el bucket ──────────────────────────────────────
do $$
declare v_ant bigint;
begin
  perform cerrar_ciclo_tc('33333333-4200-0000-0000-000000000001');
  perform pg_temp.cuadra('después de cerrar');

  select deuda_ciclo_anterior into v_ant
    from tarjetas_credito where id = '33333333-4200-0000-0000-000000000001';
  assert v_ant > 0, 'el test perdió su sentido: el cierre no dejó nada en el bucket anterior';
end $$;

-- ── 5. Un cargo DESPUÉS del cierre va al ciclo nuevo ──────────────────
-- Es el escenario que no se podía derivar sin `cerrado_at`, y el que decide
-- si la derivación entendió el orden.
do $$
begin
  perform pg_temp.mov('44444444-4200-0000-0000-000000000005', 'gasto_tc', 70000);
  perform pg_temp.cuadra('cargo después del cierre');
end $$;

-- ── 6. Un pago que se REPARTE entre los dos buckets ───────────────────
-- El caso que más caro salió históricamente: el pago liquida primero el
-- estado de cuenta cerrado y el sobrante baja el ciclo abierto.
do $$
declare v_ant bigint; v_act bigint;
begin
  select deuda_ciclo_anterior, deuda_actual into v_ant, v_act
    from tarjetas_credito where id = '33333333-4200-0000-0000-000000000001';
  assert v_ant > 0 and v_act > 0,
    format('el test perdió su sentido: hacen falta los dos buckets con saldo (ant %s, act %s)', v_ant, v_act);

  -- Más que el bucket anterior y menos que el total: obliga al reparto.
  perform pg_temp.mov('44444444-4200-0000-0000-000000000006', 'pago_tc', v_ant + 10000);
  perform pg_temp.cuadra('pago repartido entre los dos buckets');

  select deuda_ciclo_anterior into v_ant
    from tarjetas_credito where id = '33333333-4200-0000-0000-000000000001';
  assert v_ant = 0, format('el pago debía liquidar el bucket anterior, quedó en %s', v_ant);
end $$;

-- ── 7. Un sobrepago no deja deuda negativa ni crédito ─────────────────
do $$
declare v_ant bigint; v_act bigint;
begin
  perform pg_temp.mov('44444444-4200-0000-0000-000000000007', 'pago_tc', 999999);
  perform pg_temp.cuadra('sobrepago');

  select bucket_anterior, bucket_actual into v_ant, v_act
    from deuda_tc_derivada('33333333-4200-0000-0000-000000000001');
  assert v_ant = 0 and v_act = 0,
    format('un sobrepago debía dejar los dos buckets en 0, dejó ant %s / act %s', v_ant, v_act);
end $$;

-- ── 8. Borrar un movimiento: los dos lados lo olvidan igual ───────────
do $$
begin
  perform pg_temp.mov('44444444-4200-0000-0000-000000000008', 'gasto_tc', 33000);
  perform pg_temp.cuadra('cargo antes de borrarlo');
  delete from transacciones where id = '44444444-4200-0000-0000-000000000008';
  perform pg_temp.cuadra('después de borrar el cargo');
end $$;

-- ── 9. Dos cierres seguidos ───────────────────────────────────────────
do $$
begin
  perform pg_temp.mov('44444444-4200-0000-0000-000000000009', 'gasto_tc', 15000);
  perform cerrar_ciclo_tc('33333333-4200-0000-0000-000000000001');
  perform pg_temp.cuadra('segundo cierre');
  perform pg_temp.mov('44444444-4200-0000-0000-00000000000a', 'gasto_tc', 7000);
  perform cerrar_ciclo_tc('33333333-4200-0000-0000-000000000001');
  perform pg_temp.cuadra('tercer cierre');
end $$;

-- ── 10. La derivación NO usa ciclo_id ─────────────────────────────────
-- Todos los movimientos de este test se insertaron con ciclo_id NULL y la
-- derivación coincidió en los nueve pasos anteriores. Acá solo se afirma el
-- hecho, para que si alguien "arregla" la función usando la FK, esto lo diga.
do $$
declare v_con_ciclo int;
begin
  select count(*) into v_con_ciclo
    from transacciones
   where tarjeta_id = '33333333-4200-0000-0000-000000000001'
     and ciclo_id is not null;
  assert v_con_ciclo = 0,
    format('%s movimientos traen ciclo_id: el test dejó de probar que la derivación no lo necesita', v_con_ciclo);
end $$;

-- ── 11. Un ciclo cerrado sin instante: se rinde, no adivina ───────────
do $$
declare v_ok boolean; v_motivo text; v_ant bigint;
begin
  update ciclos_tc set cerrado_at = null
   where tarjeta_id = '33333333-4200-0000-0000-000000000001'
     and estado::text <> 'abierto';

  select bucket_anterior, derivable, motivo into v_ant, v_ok, v_motivo
    from deuda_tc_derivada('33333333-4200-0000-0000-000000000001');

  assert not v_ok, 'con un cierre sin instante la derivación no puede decir que sí';
  assert v_ant is null, format('al rendirse no debe devolver un número, devolvió %s', v_ant);
  assert v_motivo like '%no es derivable%',
    format('el motivo tiene que explicar qué pasó, dice: %s', v_motivo);
end $$;

-- ── 12. La reconciliación reporta una fila por tarjeta ────────────────
do $$
declare v_filas int; v_cuadra boolean; v_dif bigint;
begin
  -- Se restauran los instantes para que la tarjeta vuelva a ser derivable.
  update ciclos_tc set cerrado_at = clock_timestamp()
   where tarjeta_id = '33333333-4200-0000-0000-000000000001'
     and estado::text <> 'abierto';

  select count(*) into v_filas from reconciliar_deuda_tc();
  assert v_filas = 1, format('debía haber 1 tarjeta, hay %s', v_filas);

  select cuadra, diferencia_total into v_cuadra, v_dif
    from reconciliar_deuda_tc()
   where tarjeta_id = '33333333-4200-0000-0000-000000000001';
  assert v_cuadra, format('la tarjeta no cuadra: diferencia %s', v_dif);
  assert v_dif = 0, format('la diferencia debía ser 0, es %s', v_dif);
end $$;

-- ── 13. Con una diferencia inyectada, la reconciliación la ve ─────────
-- Es el escenario del Q6.50: un delta suelto en el total corriente que el
-- ledger no respalda. Sin esta comprobación la reconciliación podría estar
-- devolviendo `cuadra = true` sin comparar nada.
do $$
declare v_cuadra boolean; v_dif bigint;
begin
  perform set_config('vorta.reparto_manual', 'on', true);
  update tarjetas_credito set deuda_actual = deuda_actual + 650
   where id = '33333333-4200-0000-0000-000000000001';
  perform set_config('vorta.reparto_manual', 'off', true);

  select cuadra, diferencia_total into v_cuadra, v_dif
    from reconciliar_deuda_tc()
   where tarjeta_id = '33333333-4200-0000-0000-000000000001';

  assert not v_cuadra, 'un delta suelto de Q6.50 tiene que romper la reconciliación';
  assert v_dif = 650, format('la diferencia debía ser 650 centavos, es %s', v_dif);
end $$;

-- ── 14. Un reparto guardado IMPOSIBLE se detecta ──────────────────────
-- El punto ciego de comparar totales: dos errores de la misma magnitud en
-- sentidos opuestos se cancelan y la tarjeta parece cuadrar. Es el caso real
-- de "Ysi Visa": un pago cuyo reparto guardado excede la deuda que había en
-- el momento. Borrar esa fila devolvería deuda fantasma.
do $$
declare v_filas int; v_exceso bigint; v_habia bigint;
begin
  -- Tarjeta limpia: un cargo de 1000 y un pago de 1000, pero con el reparto
  -- guardado inflado en 650 — exactamente la forma del caso real.
  insert into tarjetas_credito (
    id, user_id, nombre, limite_credito, deuda_actual, deuda_ciclo_anterior,
    dia_cierre, dia_pago, color
  ) values (
    '33333333-4200-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111', 'TC reparto', 10000000, 0, 0,
    15, 5, '#fff'
  );

  insert into transacciones (id, user_id, cuenta_id, tarjeta_id, fecha, cantidad, descripcion, categoria, tipo, created_at)
  values ('44444444-4200-0000-0000-0000000000b1',
          '11111111-1111-1111-1111-111111111111', null,
          '33333333-4200-0000-0000-000000000002',
          date '2026-09-01', -100000, 'Cargo', 'Otros', 'gasto_tc', clock_timestamp());
  insert into transacciones (id, user_id, cuenta_id, tarjeta_id, fecha, cantidad, descripcion, categoria, tipo, created_at)
  values ('44444444-4200-0000-0000-0000000000b2',
          '11111111-1111-1111-1111-111111111111',
          '22222222-4200-0000-0000-000000000001',
          '33333333-4200-0000-0000-000000000002',
          date '2026-09-02', -100650, 'Pago de más', 'Otros', 'pago_tc', clock_timestamp());

  -- Sin ofensas todavía: el trigger recortó bien el reparto.
  select count(*) into v_filas from verificar_reparto_tc('33333333-4200-0000-0000-000000000002');
  assert v_filas = 0,
    format('el trigger recorta el reparto, no debía haber ofensas y hay %s', v_filas);

  -- Ahora se infla el reparto guardado, como lo dejó el backfill de septiembre.
  perform set_config('vorta.reparto_manual', 'on', true);
  update transacciones set aplicado_actual = -100650
   where id = '44444444-4200-0000-0000-0000000000b2';
  perform set_config('vorta.reparto_manual', 'off', true);

  select count(*) into v_filas from verificar_reparto_tc('33333333-4200-0000-0000-000000000002');
  assert v_filas = 1, format('el reparto imposible debía salir como 1 ofensa, salieron %s', v_filas);

  select exceso, habia_para_pagar into v_exceso, v_habia
    from verificar_reparto_tc('33333333-4200-0000-0000-000000000002');
  assert v_exceso = 650, format('el exceso debía ser 650 centavos, es %s', v_exceso);
  assert v_habia = 100000, format('había 100000 para pagar, la función dice %s', v_habia);
end $$;

-- ── 15. Y la tarjeta de ese caso CUADRA de todas formas ───────────────
-- Es la demostración del punto ciego: reconciliar totales dice que todo está
-- bien, y por eso las dos comprobaciones tienen que existir.
do $$
declare v_cuadra boolean;
begin
  select cuadra into v_cuadra from reconciliar_deuda_tc()
   where tarjeta_id = '33333333-4200-0000-0000-000000000002';
  assert v_cuadra,
    'si esta tarjeta NO cuadrara, el test 14 no estaría probando un punto ciego';
end $$;

rollback;
