-- ══════════════════════════════════════════════════════════════════════
-- Stub de lo que Supabase provee y un PostgreSQL pelado no tiene.
--
-- Existe SOLO para poder correr supabase/schema.sql en un cluster local y
-- probar los triggers de verdad. No se aplica nunca a un proyecto de Supabase:
-- allá `auth.users` y `auth.uid()` ya existen.
-- ══════════════════════════════════════════════════════════════════════
create extension if not exists "uuid-ossp";

create schema if not exists auth;

-- Los roles que Supabase crea en cada proyecto. Un PostgreSQL pelado no los
-- trae, y `schema.sql` los necesita para el `grant execute` de
-- `borrar_mi_cuenta` (tarea 2.2).
do $$
begin
  create role anon;
exception when duplicate_object then null;
end $$;
do $$
begin
  create role authenticated;
exception when duplicate_object then null;
end $$;

create table if not exists auth.users (
  id uuid primary key default uuid_generate_v4()
);

-- El schema.sql declara las policies con `auth.uid() = user_id`. En el test se
-- corre como superusuario, así que RLS no se evalúa; la función tiene que
-- existir igual para que las policies se puedan CREAR.
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- Como el de Supabase: los claims del JWT de la petición. Las funciones de
-- acceso de IA (`es_acceso_ia`) leen `client_id` de acá.
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;
