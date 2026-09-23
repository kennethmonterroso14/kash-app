-- ══════════════════════════════════════════════════════════════════════
-- VORTA — Migración: color de acento en el perfil
-- Archivo: supabase/migrations/20260923000000_profiles_acento.sql
--
-- Correr a mano en Supabase → SQL Editor → New query, con NADA seleccionado.
--
-- QUÉ AGREGA
--   `profiles.acento`: el color de acento que el usuario elige en Ajustes
--   (ids de `acentos` en src/lib/tokens.js). Con default 'morado', las filas
--   existentes quedan con el color de siempre.
--
-- SIN ESTA MIGRACIÓN la app funciona igual: el provider relee el perfil sin la
-- columna y el acento se guarda solo en el dispositivo (localStorage). Lo que
-- agrega es que el color elegido siga al usuario entre dispositivos.
--
-- Es aditiva e idempotente (`add column if not exists`); se puede correr dos
-- veces. `supabase/schema.sql` ya la incluye y es el autoritativo.
-- ══════════════════════════════════════════════════════════════════════

alter table profiles
  add column if not exists acento text not null default 'morado';

-- La lista vive en el cliente; acá solo se impide basura (y un texto enorme).
do $$ begin
  alter table profiles add constraint profiles_acento_check
    check (acento in ('morado', 'azul', 'cian', 'menta', 'amarillo', 'naranja', 'rosa', 'grafito'));
exception when duplicate_object then null; end $$;
