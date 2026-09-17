-- ══════════════════════════════════════════════════════════════════════
-- VORTA — Migración aditiva: locale y zona horaria en profiles
-- Archivo: supabase/migrations/20260917010000_profiles_locale_zona_horaria.sql
--
-- ESTADO: APLICADO en el proyecto de producción "Finanzas app"
-- (bduvzluntatmhfujqvvm) el 2026-09-17, vía el conector de Supabase.
-- Registrado ahí como la migración `profiles_locale_zona_horaria`.
--
-- Verificado después de aplicar: las dos columnas existen, `not null` con los
-- defaults puestos, y los 7 perfiles quedaron en GTQ / es-GT /
-- America/Guatemala — o sea, exactamente como estaban.
--
-- Tarea 1.3.4 del plan de la Fase 1. Prerrequisito de lanzar fuera de
-- Guatemala: `formatMoneda` y `hoyEn` ya están parametrizados en el cliente,
-- pero no hay de dónde leer el locale ni la zona del usuario.
--
-- `profiles.moneda` ya existía (default 'GTQ') y hasta ahora no se usaba: el
-- formateador tenía GTQ y es-GT cableados. Con estas dos columnas el trío
-- queda completo.
--
-- Es puramente aditiva y con defaults, así que no rompe a ningún usuario
-- existente: todos quedan exactamente como estaban (es-GT / Guatemala).
-- Idempotente: se puede correr dos veces sin efecto extra.
--
-- Ojo con el editor de Supabase: si hay texto seleccionado corre SOLO la
-- selección. Correr el archivo completo, sin seleccionar nada.
-- ══════════════════════════════════════════════════════════════════════

-- ─── PASO 1 · Las dos columnas ────────────────────────────────────────
--
-- `not null` con default y no nullable a propósito: un locale nulo obligaría a
-- cada sitio de lectura a decidir un fallback, y ahí es donde aparecen las
-- discrepancias. El default es el valor que la app ya asumía.
--
-- No lleva check constraint de zona IANA: validarlo en la base necesitaría
-- consultar `pg_timezone_names`, que no es inmutable y por lo tanto no se
-- puede usar en un check. La validación vive en el cliente (`zonaValida()` en
-- src/lib/constants.ts), y el provider de sesión marca error en el perfil en
-- lugar de adivinar una zona — adivinarla escribiría fechas equivocadas.
alter table profiles
  add column if not exists locale       text not null default 'es-GT',
  add column if not exists zona_horaria text not null default 'America/Guatemala';

-- ─── PASO 2 · Verificación ────────────────────────────────────────────
-- Debe devolver las dos columnas, `not null` = NO y los defaults puestos.
select column_name, data_type, is_nullable, column_default
from   information_schema.columns
where  table_schema = 'public'
  and  table_name   = 'profiles'
  and  column_name in ('moneda', 'locale', 'zona_horaria')
order  by column_name;

-- Y que ninguna fila haya quedado sin valor.
select count(*) as perfiles,
       count(*) filter (where locale       is null) as sin_locale,
       count(*) filter (where zona_horaria is null) as sin_zona
from   profiles;
