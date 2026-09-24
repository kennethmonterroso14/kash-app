-- ══════════════════════════════════════════════════════════════════════
-- VORTA — Migración: qué puede hacer un asistente de IA conectado
-- Archivo: supabase/migrations/20260924000000_acceso_ia.sql
--
-- Correr a mano en Supabase → SQL Editor → New query, con NADA seleccionado.
--
-- QUÉ HACE
--   Un asistente conectado por el conector MCP (docs/MCP.md) lee y agrega,
--   pero solo EDITA o BORRA si la persona lo activa en Ajustes → Asistentes de
--   IA. Nunca toca el perfil ni borra la cuenta. La app (sesión normal, sin el
--   claim `client_id`) no cambia en nada.
--
--   `cerrar_ciclo_tc` se recrea igual que en schema.sql, con un chequeo más.
--   `borrar_mi_cuenta()` trae su propio chequeo en 20260922000000, que va
--   DESPUÉS de esta (usa `es_acceso_ia()`). Las dos, aplicadas en producción
--   el 2026-09-24 en ese orden.
--
-- Aditiva e idempotente: se puede correr dos veces. `supabase/schema.sql` ya
-- la incluye y es el autoritativo.
-- ══════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════
-- 4b. ACCESO DE ASISTENTES DE IA  (conector MCP, api/mcp)
--
--     Un asistente conectado por OAuth usa un token de Supabase con el claim
--     `client_id`; la sesión de la app no lo tiene. Con ese token el asistente
--     ES la persona para RLS, así que sin nada más podría hablarle a PostgREST
--     directo y editar o borrar lo que quisiera, saltándose el conector.
--
--     Estas policies RESTRICTIVAS (se combinan con AND con las `_own`):
--       · SELECT e INSERT: sin cambios — el asistente lee y agrega.
--       · UPDATE y DELETE: solo si la persona lo activó en Ajustes →
--         Asistentes de IA (`profiles.ia_puede_editar`, apagado por defecto).
--       · `profiles`: NUNCA desde un asistente — si pudiera, se prendería el
--         permiso a sí mismo.
--       · `borrar_mi_cuenta()`: nunca; `cerrar_ciclo_tc()`: como un UPDATE.
--
--     Los triggers de saldo y de deuda siguen funcionando con un insert del
--     asistente: son `security definer` y su dueño (postgres) tiene
--     BYPASSRLS — verificado en producción el 2026-09-24.
-- ══════════════════════════════════════════════════════════════════════

alter table profiles
  add column if not exists ia_puede_editar boolean not null default false;

create or replace function public.es_acceso_ia()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(auth.jwt() ->> 'client_id', '') <> ''
$$;

-- Sin `security definer`: lee el perfil propio con el RLS de quien llama, y
-- ninguna policy de `profiles` la usa, así que no hay recursión.
create or replace function public.ia_puede_modificar()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select not public.es_acceso_ia()
      or coalesce((select p.ia_puede_editar from public.profiles p where p.user_id = auth.uid()), false)
$$;

do $$
declare
  t text;
  permiso text;
begin
  foreach t in array array[
    'profiles', 'cuentas', 'transacciones', 'presupuestos', 'metas_ahorro',
    'tarjetas_credito', 'ciclos_tc', 'pagos_recurrentes',
    'categorias_usuario', 'inversiones', 'inversiones_historial'
  ]
  loop
    -- `(select …)` para que se evalúe una vez por consulta y no por fila.
    permiso := case when t = 'profiles'
                    then '(select not public.es_acceso_ia())'
                    else '(select public.ia_puede_modificar())' end;
    execute format('drop policy if exists %I on public.%I', t || '_ia_update', t);
    execute format('create policy %I on public.%I as restrictive for update using (%s)',
                   t || '_ia_update', t, permiso);
    execute format('drop policy if exists %I on public.%I', t || '_ia_delete', t);
    execute format('create policy %I on public.%I as restrictive for delete using (%s)',
                   t || '_ia_delete', t, permiso);
  end loop;
end $$;

-- ── cerrar_ciclo_tc: un asistente sin permiso de modificar no cierra ciclos ──

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
  v_ciclos_cerr   uuid[];
  v_ultimo_cierre date;
  v_inicio        date;
  v_cierre        date;
  v_pago          date;
begin
  if v_uid is null then
    raise exception 'cerrar_ciclo_tc requiere una sesión autenticada';
  end if;
  -- Un asistente de IA solo cierra ciclos si la persona le permitió modificar
  -- (Ajustes → Asistentes de IA). Ver la sección 4b.
  if not public.ia_puede_modificar() then
    raise exception 'cerrar_ciclo_tc no está permitido para este asistente de IA';
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
  -- dos toques seguidos al botón encadenen ciclos vacíos.
  if v_tc.deuda_actual = 0
     and (v_ciclo_id is null
          or not exists (
            select 1 from transacciones
             where ciclo_id = v_ciclo_id
               and tipo = 'gasto_tc'
          )) then
    return;
  end if;

  -- Se capturan ANTES de cerrarlos, para migrar solo el reparto de las filas
  -- que este cierre arrastra (y que un segundo cierre sea idempotente).
  select coalesce(array_agg(id), '{}')
    into v_ciclos_cerr
    from ciclos_tc
   where tarjeta_id = p_tarjeta_id
     and user_id = v_uid
     and estado = 'abierto';

  -- `cerrado_at` es el momento REAL del cierre, y es lo que vuelve
  -- reproducible la historia de la deuda: sin él no se sabe si un cargo entró
  -- antes o después de que su monto pasara al bucket anterior. `clock_timestamp()`
  -- y no `now()`: `now()` es el inicio de la transacción, y dos cierres en la
  -- misma transacción quedarían con el mismo instante y sin orden entre ellos.
  update ciclos_tc
     set estado = 'cerrado',
         saldo_final = v_tc.deuda_actual,
         cerrado_at = clock_timestamp()
   where tarjeta_id = p_tarjeta_id
     and user_id = v_uid
     and estado = 'abierto';

  update tarjetas_credito
     set deuda_ciclo_anterior = deuda_ciclo_anterior + deuda_actual,
         deuda_actual = 0
   where id = p_tarjeta_id
     and user_id = v_uid;

  -- El cierre acaba de mover estos cargos de deuda_actual a
  -- deuda_ciclo_anterior, así que su reparto guardado tiene que moverse con
  -- ellos. Sin esto, aplicado_actual apunta a un bucket donde el monto ya no
  -- está y al eliminar el cargo la reversión resta del bucket equivocado
  -- (era la vía por la que D1 seguía siendo alcanzable tras un cierre).
  perform set_config('vorta.reparto_manual', 'on', true);
  update transacciones
     set aplicado_ciclo_anterior = coalesce(aplicado_ciclo_anterior, 0) + aplicado_actual,
         aplicado_actual         = 0
   where tarjeta_id = p_tarjeta_id
     and user_id    = v_uid
     and tipo       = 'gasto_tc'
     and aplicado_actual is not null
     and aplicado_actual <> 0
     and ciclo_id = any(v_ciclos_cerr);
  perform set_config('vorta.reparto_manual', 'off', true);

  -- ── Sucesor: contiguo al último cierre registrado ──
  select max(fecha_cierre) into v_ultimo_cierre
    from ciclos_tc
   where tarjeta_id = p_tarjeta_id
     and user_id = v_uid;

  -- Si la tarjeta no tenía ningún ciclo, se arranca hoy en calendario
  -- Guatemala (nunca en la zona del servidor).
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

  insert into ciclos_tc (
    tarjeta_id, user_id, fecha_inicio, fecha_cierre, fecha_pago, estado
  )
  values (p_tarjeta_id, v_uid, v_inicio, v_cierre, v_pago, 'abierto')
  on conflict (tarjeta_id, fecha_inicio) do nothing;
end;
$$;
