-- ══════════════════════════════════════════════════════════════════════
-- VORTA — Migración correctiva: deuda de TC + cierre de ciclo
-- Archivo: supabase/migrations/20260917000000_fix_deuda_tc_y_cierre_ciclo.sql
--
-- NO SE APLICÓ NADA. Este archivo es SQL que hay que correr a mano en
-- Supabase → SQL Editor → New query (este repo no tiene herramienta de
-- migraciones ni acceso a la base). Es idempotente y se puede correr dos
-- veces sin efecto extra.
--
-- Contiene SOLO lo correctivo para una base YA DESPLEGADA. Para provisionar
-- un proyecto nuevo alcanza con supabase/schema.sql, que ya incluye todo
-- esto (los dos archivos definen las mismas funciones; schema.sql es el
-- autoritativo).
--
-- Defectos que corrige (todos en el bloque SQL de
-- docs/superpowers/plans/2026-04-03-fase6-tarjetas-credito.md, que queda
-- superseded por supabase/schema.sql):
--
--   D1. actualizar_deuda_tc DELETE de un pago_tc devolvía TODO el monto a
--       `deuda_actual`, aunque el pago hubiera salido de
--       `deuda_ciclo_anterior`. La deuda quedaba clasificada como ciclo
--       abierto: se apagaba la alerta pago_vencido y el banner "Pagar … antes
--       del día N", y `calcResumenTC` reportaba uso del límite inventado.
--       Peor: delete + "Deshacer" (restoreTxn) re-aplicaba el pago contra un
--       `deuda_ciclo_anterior` ya en 0 y BORRABA la deuda por completo.
--   D2. El branch UPDATE no tenía caso `pago_tc`: editar el monto de un pago
--       no tocaba la deuda de la tarjeta.
--   D3. cerrar_ciclo_tc dejaba la tarjeta SIN ciclo abierto. El siguiente
--       cargo reconstruía las fechas desde hoy, obtenía la misma
--       `fecha_inicio` del ciclo recién cerrado y chocaba con
--       unique(tarjeta_id, fecha_inicio) → 23505 y el cargo se perdía.
--   D4. cerrar_ciclo_tc era SECURITY DEFINER sin scoping por usuario:
--       cualquier sesión autenticada podía cerrar el ciclo y mover la deuda
--       de la tarjeta de OTRO usuario pasando su uuid. Agujero cross-tenant.
--       El mismo agujero existía en actualizar_deuda_tc (una transacción
--       propia con `tarjeta_id` ajeno mutaba deuda ajena).
--   D5. RLS habilitada con cero policies (el bloque de la Fase 6 usaba
--       `create policy if not exists`, sintaxis que no existe en PostgreSQL,
--       así que ese bloque abortaba y hacía rollback de todo).
-- ══════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════
-- PASO 1 (D1, D2) — Persistir el reparto de cada movimiento de TC
--
-- Raíz del defecto: el INSERT repartía un pago entre los dos buckets
-- (`deuda_ciclo_anterior` primero, el sobrante contra `deuda_actual`) y ese
-- reparto se perdía. Con `greatest(0, …)` de por medio, ninguna aritmética
-- sobre OLD.cantidad puede reconstruirlo. Se guarda en la propia fila.
--
-- Semántica: DELTA CON SIGNO aplicado a cada bucket.
--   gasto_tc → aplicado_actual = +abs(cantidad), aplicado_ciclo_anterior = 0
--   pago_tc  → ambos ≤ 0 (lo que realmente bajó de cada bucket)
--   NULL     → reparto desconocido (fila anterior a esta migración)
-- Revertir = restar el delta; aplicar = sumarlo.
-- ══════════════════════════════════════════════════════════════════════

alter table transacciones
  add column if not exists aplicado_ciclo_anterior bigint,
  add column if not exists aplicado_actual         bigint;

-- Se dejan NULLABLES a propósito (sin `not null default 0`): NULL distingue
-- "reparto nunca registrado" de "reparto registrado y fue 0" (un pago sobre
-- una tarjeta sin deuda). Sin esa distinción el backfill no sería
-- re-ejecutable sin pisar repartos reales.


-- ══════════════════════════════════════════════════════════════════════
-- PASO 2 (D1) — Backfill del reparto de las filas existentes
--
-- Antes de correr esto conviene guardarse la lista de pagos afectados, que
-- después ya no se puede distinguir:
--
--   select id, fecha, tarjeta_id, cantidad
--     from transacciones
--    where tipo = 'pago_tc' and aplicado_ciclo_anterior is null
--    order by fecha;
-- ══════════════════════════════════════════════════════════════════════

-- 2a. gasto_tc: EXACTO. Un cargo siempre sumó su monto completo a
--     `deuda_actual`, nunca hubo reparto ni clamp.
update transacciones
   set aplicado_ciclo_anterior = 0,
       aplicado_actual         = abs(cantidad)
 where tipo = 'gasto_tc'
   and tarjeta_id is not null
   and (aplicado_ciclo_anterior is null or aplicado_actual is null);

-- 2b. Movimientos que no tocan deuda de TC: reparto vacío, también exacto.
update transacciones
   set aplicado_ciclo_anterior = 0,
       aplicado_actual         = 0
 where (tarjeta_id is null or tipo not in ('gasto_tc', 'pago_tc'))
   and (aplicado_ciclo_anterior is null or aplicado_actual is null);

-- 2c. pago_tc: NO ES RECUPERABLE.
--     El reparto que hizo el INSERT no quedó registrado en ninguna parte y
--     no se puede re-derivar del ledger: haría falta re-simular la historia
--     de la tarjeta, y los cierres de ciclo (cerrar_ciclo_tc mueve
--     deuda_actual → deuda_ciclo_anterior) no tienen fecha/hora guardada —
--     `ciclos_tc` solo tiene la fecha_cierre teórica, y el usuario cierra
--     cuando quiere. Así que aquí se ASUME el reparto que el INSERT
--     intentaba: todo contra el estado de cuenta ya facturado.
--
--     Consecuencia honesta de la suposición: si el pago superaba
--     `deuda_ciclo_anterior`, parte había salido de `deuda_actual`, y
--     eliminar ese pago va a devolver de más a `deuda_ciclo_anterior` y de
--     menos a `deuda_actual`. El TOTAL de deuda se conserva (igual que
--     hacía el branch viejo) y el bucket elegido es el más probable, en
--     lugar del bucket seguro-que-equivocado de antes.
--     La alternativa (dejar 0/0) haría que eliminar un pago viejo no
--     devolviera nada: eso sí BORRA deuda real, y es peor.
do $$
declare
  v_filas bigint;
begin
  update transacciones
     set aplicado_ciclo_anterior = -abs(cantidad),
         aplicado_actual         = 0
   where tipo = 'pago_tc'
     and tarjeta_id is not null
     and (aplicado_ciclo_anterior is null or aplicado_actual is null);
  get diagnostics v_filas = row_count;
  if v_filas > 0 then
    raise notice 'Backfill pago_tc: % fila(s) con reparto RECONSTRUIDO (asumido 100%% contra deuda_ciclo_anterior). Revisar antes de eliminar/editar esos pagos.', v_filas;
  end if;
end $$;


-- ══════════════════════════════════════════════════════════════════════
-- PASO 3 (D1, D2, D4) — Trigger de deuda exactamente reversible
--
-- Pasa de AFTER a BEFORE porque tiene que escribir el reparto en la fila.
-- Estructura: revertir OLD (update/delete) → aplicar NEW (insert/update),
-- así los tres branches son inversos exactos y un cambio de monto, de tipo
-- o de tarjeta_id queda consistente.
-- La tarjeta se bloquea con `for update` antes de calcular el reparto (dos
-- pago_tc concurrentes ya no pueden leer el mismo saldo previo) y se filtra
-- por user_id (D4: la función es SECURITY DEFINER y RLS no la limita).
-- ══════════════════════════════════════════════════════════════════════

create or replace function actualizar_deuda_tc()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ant   bigint;   -- deuda_ciclo_anterior de la tarjeta (ya bloqueada)
  v_act   bigint;   -- deuda_actual de la tarjeta (ya bloqueada)
  v_monto bigint;   -- monto absoluto del movimiento
  v_d_ant bigint;   -- delta a aplicar sobre deuda_ciclo_anterior
  v_d_act bigint;   -- delta a aplicar sobre deuda_actual
begin
  -- ── 1. Revertir el efecto de OLD (UPDATE y DELETE) ──────────────────
  if TG_OP in ('UPDATE', 'DELETE')
     and OLD.tarjeta_id is not null
     and OLD.tipo in ('gasto_tc', 'pago_tc') then

    if OLD.aplicado_ciclo_anterior is null or OLD.aplicado_actual is null then
      -- Fila anterior a esta migración cuyo reparto no se guardó. Adivinarlo
      -- puede borrar deuda real, así que se rechaza la operación en vez de
      -- corromper la tarjeta en silencio. Corré el PASO 2.
      raise exception
        'La transacción % no tiene reparto de deuda registrado (aplicado_ciclo_anterior / aplicado_actual). Corré el backfill del PASO 2 de esta migración antes de editarla o eliminarla.',
        OLD.id;
    end if;

    update tarjetas_credito
       set deuda_ciclo_anterior = greatest(0, deuda_ciclo_anterior - OLD.aplicado_ciclo_anterior),
           deuda_actual         = greatest(0, deuda_actual         - OLD.aplicado_actual)
     where id = OLD.tarjeta_id
       and user_id = OLD.user_id;
  end if;

  -- ── 2. Aplicar el efecto de NEW (INSERT y UPDATE) ───────────────────
  if TG_OP in ('INSERT', 'UPDATE') then
    if NEW.tarjeta_id is not null and NEW.tipo in ('gasto_tc', 'pago_tc') then
      v_monto := abs(NEW.cantidad);

      select deuda_ciclo_anterior, deuda_actual
        into v_ant, v_act
        from tarjetas_credito
       where id = NEW.tarjeta_id
         and user_id = NEW.user_id
         for update;
      if not found then
        raise exception 'La tarjeta % no existe o no pertenece al usuario %',
          NEW.tarjeta_id, NEW.user_id;
      end if;

      if NEW.tipo = 'gasto_tc' then
        -- Un cargo siempre engorda el ciclo abierto.
        v_d_ant := 0;
        v_d_act := v_monto;
      else
        -- Un pago liquida primero el estado de cuenta ya cerrado y el
        -- sobrante baja el ciclo abierto. v_d_ant / v_d_act son negativos.
        -- El excedente de un sobrepago no toca ningún bucket (y por eso
        -- tampoco reaparece al eliminar el pago).
        v_d_ant := - least(v_monto, v_ant);
        v_d_act := - least(v_monto + v_d_ant, v_act);
      end if;

      NEW.aplicado_ciclo_anterior := v_d_ant;
      NEW.aplicado_actual         := v_d_act;

      update tarjetas_credito
         set deuda_ciclo_anterior = greatest(0, deuda_ciclo_anterior + v_d_ant),
             deuda_actual         = greatest(0, deuda_actual         + v_d_act)
       where id = NEW.tarjeta_id
         and user_id = NEW.user_id;
    else
      -- Movimiento que no toca deuda de TC: reparto explícitamente vacío.
      NEW.aplicado_ciclo_anterior := 0;
      NEW.aplicado_actual         := 0;
    end if;
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

-- `create trigger` no acepta IF NOT EXISTS, y acá además cambia el timing
-- (AFTER → BEFORE), así que se recrea. `drop … if exists` en vez de
-- `create or replace trigger` para no depender de PG 14+.
drop trigger if exists trg_deuda_tc on transacciones;
create trigger trg_deuda_tc
  before insert or update or delete on transacciones
  for each row execute function actualizar_deuda_tc();


-- ══════════════════════════════════════════════════════════════════════
-- PASO 4 (D3) — Helper de fechas con recorte de fin de mes
-- Una tarjeta con cierre 31 cierra el 28/29 en febrero y el 30 en los meses
-- de 30 días (igual que _diaClamp en src/lib/finanzas.ts).
-- ══════════════════════════════════════════════════════════════════════

create or replace function dia_del_mes_clamp(p_base date, p_dia int)
returns date
language sql
immutable
as $$
  select date_trunc('month', p_base::timestamp)::date
         + (least(
              p_dia,
              extract(day from (
                date_trunc('month', p_base::timestamp) + interval '1 month' - interval '1 day'
              ))::int
            ) - 1);
$$;


-- ══════════════════════════════════════════════════════════════════════
-- PASO 5 (D3, D4) — cerrar_ciclo_tc scopeado y que abre el ciclo sucesor
-- ══════════════════════════════════════════════════════════════════════

create or replace function cerrar_ciclo_tc(p_tarjeta_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid           uuid := auth.uid();
  v_tc            record;
  v_ciclo_id      uuid;
  v_ultimo_cierre date;
  v_inicio        date;
  v_cierre        date;
  v_pago          date;
begin
  -- D4: sin esto, cualquier sesión autenticada mutaba la tarjeta de otro
  -- usuario. Ojo: desde el SQL Editor auth.uid() es NULL y la función falla
  -- a propósito; para operar como admin, correr los UPDATE a mano.
  if v_uid is null then
    raise exception 'cerrar_ciclo_tc requiere una sesión autenticada';
  end if;

  select id, dia_cierre, dia_pago, deuda_actual
    into v_tc
    from tarjetas_credito
   where id = p_tarjeta_id
     and user_id = v_uid
     for update;
  if not found then
    raise exception 'Tarjeta % no encontrada para el usuario actual', p_tarjeta_id;
  end if;

  select id into v_ciclo_id
    from ciclos_tc
   where tarjeta_id = p_tarjeta_id
     and user_id = v_uid
     and estado = 'abierto'
   order by fecha_inicio desc
   limit 1;

  -- Nada que cerrar: sin deuda abierta y sin cargos en el ciclo. Evita que
  -- dos toques seguidos al botón encadenen ciclos vacíos, ahora que cerrar
  -- siempre abre un sucesor.
  if v_tc.deuda_actual = 0
     and (v_ciclo_id is null
          or not exists (
            select 1 from transacciones
             where ciclo_id = v_ciclo_id
               and tipo = 'gasto_tc'
          )) then
    return;
  end if;

  update ciclos_tc
     set estado = 'cerrado',
         saldo_final = v_tc.deuda_actual
   where tarjeta_id = p_tarjeta_id
     and user_id = v_uid
     and estado = 'abierto';

  update tarjetas_credito
     set deuda_ciclo_anterior = deuda_ciclo_anterior + deuda_actual,
         deuda_actual = 0
   where id = p_tarjeta_id
     and user_id = v_uid;

  -- ── Sucesor: contiguo al último cierre registrado ──
  -- Se deriva del ciclo CERRADO, no de hoy: así las fechas no se pisan y no
  -- pueden chocar con unique(tarjeta_id, fecha_inicio). Si el usuario cierra
  -- antes del día de cierre, el ciclo nuevo arranca en el futuro (día
  -- siguiente al cierre teórico); es el precio de la contigüidad, y el cargo
  -- siguiente igual tiene un ciclo abierto donde caer.
  select max(fecha_cierre) into v_ultimo_cierre
    from ciclos_tc
   where tarjeta_id = p_tarjeta_id
     and user_id = v_uid;

  -- Tarjeta sin ningún ciclo: se arranca hoy en calendario Guatemala, nunca
  -- en la zona del servidor.
  v_inicio := coalesce(v_ultimo_cierre + 1,
                       (now() at time zone 'America/Guatemala')::date);

  v_cierre := dia_del_mes_clamp(v_inicio, v_tc.dia_cierre);
  if v_cierre <= v_inicio then
    v_cierre := dia_del_mes_clamp(
      (date_trunc('month', v_inicio::timestamp) + interval '1 month')::date,
      v_tc.dia_cierre
    );
  end if;

  if v_tc.dia_pago > v_tc.dia_cierre then
    v_pago := dia_del_mes_clamp(v_cierre, v_tc.dia_pago);
  else
    v_pago := dia_del_mes_clamp(
      (date_trunc('month', v_cierre::timestamp) + interval '1 month')::date,
      v_tc.dia_pago
    );
  end if;

  -- `do nothing` hace idempotente un segundo cierre en la misma ventana.
  insert into ciclos_tc (
    tarjeta_id, user_id, fecha_inicio, fecha_cierre, fecha_pago, estado
  )
  values (p_tarjeta_id, v_uid, v_inicio, v_cierre, v_pago, 'abierto')
  on conflict (tarjeta_id, fecha_inicio) do nothing;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════
-- PASO 6 (D5) — Red de seguridad de RLS
-- El bloque de la Fase 6 usaba `create policy if not exists` (sintaxis
-- inexistente), abortaba y hacía rollback: es posible que alguna tabla haya
-- quedado con RLS habilitada y CERO policies, que se ve como "no hay datos"
-- en la UI en vez de como un error. Solo se crea la policy si la tabla no
-- tiene ninguna, para no duplicar las que ya existan con otro nombre.
-- ══════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
begin
  foreach t in array array[
    'tarjetas_credito', 'ciclos_tc', 'pagos_recurrentes',
    'categorias_usuario', 'inversiones', 'inversiones_historial'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabla public.% no existe: correr supabase/schema.sql', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = t
    ) then
      execute format(
        'create policy %I on public.%I for all using (auth.uid() = user_id)',
        t || '_own', t
      );
      raise notice 'public.%: no tenía ninguna policy; se creó %_own', t, t;
    end if;
  end loop;
end $$;


-- ══════════════════════════════════════════════════════════════════════
-- PASO 7 — Verificación (SELECTs, no cambian nada)
--
-- 7a. Timing del trigger: debe decir BEFORE.
--
--   select tgname,
--          case when (tgtype & 2) = 2 then 'BEFORE' else 'AFTER' end as timing
--     from pg_trigger
--    where tgrelid = 'public.transacciones'::regclass
--      and not tgisinternal;
--
-- 7b. No debe quedar ninguna fila de TC sin reparto:
--
--   select count(*) from transacciones
--    where tipo in ('gasto_tc', 'pago_tc')
--      and tarjeta_id is not null
--      and (aplicado_ciclo_anterior is null or aplicado_actual is null);
--
-- 7c. Invariante "un solo ciclo abierto por tarjeta" (debe dar 0 filas):
--
--   select tarjeta_id, count(*)
--     from ciclos_tc where estado = 'abierto'
--    group by tarjeta_id having count(*) <> 1;
--
-- 7d. Deriva de los buckets de deuda. HEURÍSTICO, no una reconciliación:
--     los totales se mantienen con deltas desde el día 1 y ya venían
--     drifteados por D1/D2, y la historia real NO se puede re-simular
--     (los cierres de ciclo no guardan cuándo ocurrieron). Comparar con el
--     estado de cuenta del banco y corregir a mano:
--
--   select t.id, t.nombre,
--          t.deuda_actual + t.deuda_ciclo_anterior as total_en_tarjeta,
--          greatest(0, coalesce(sum(
--            case when x.tipo = 'gasto_tc' then abs(x.cantidad)
--                 when x.tipo = 'pago_tc'  then -abs(x.cantidad) end), 0))
--            as total_segun_ledger
--     from tarjetas_credito t
--     left join transacciones x
--            on x.tarjeta_id = t.id and x.tipo in ('gasto_tc', 'pago_tc')
--    group by t.id, t.nombre, t.deuda_actual, t.deuda_ciclo_anterior;
--
--     Corrección manual (única forma legítima de escribir estas columnas;
--     desde el cliente NUNCA se tocan). Descomentar y completar:
--
--   -- update tarjetas_credito
--   --    set deuda_ciclo_anterior = <centavos facturados y pendientes>,
--   --        deuda_actual         = <centavos del ciclo abierto>
--   --  where id = '<uuid de la tarjeta>';
-- ══════════════════════════════════════════════════════════════════════
