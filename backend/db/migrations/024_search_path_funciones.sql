-- =============================================================================
-- AlojaU - 024: fijar search_path en las funciones de public (aviso del asesor).
-- Espejo Alembic: backend/alembic/versions/024_search_path_funciones.py
-- (mismo efecto; el .sql manda en Supabase/CI, el .py en `alembic upgrade`).
-- Idempotente: ALTER FUNCTION ... SET es repetible.
--
-- POR QUÉ: sin search_path fijo, una función resuelve nombres según el
-- search_path de quien la llama. Supabase lo marca como "Function Search Path
-- Mutable" (riesgo de secuestro de nombres). Solo cambia la configuración de
-- las dos funciones; no toca datos, tablas ni triggers.
--
-- AVISO: si vuelves a ejecutar 005_fix_estado_and_campus.sql (CREATE OR REPLACE),
-- la configuración se pierde. Ejecuta este 024 después.
--
-- DOWNGRADE:
--   ALTER FUNCTION public.haversine_m(double precision, double precision, double precision, double precision) RESET search_path;
--   ALTER FUNCTION public.trg_fn_publicacion_recalcular_distancias() RESET search_path;
-- =============================================================================

ALTER FUNCTION public.haversine_m(double precision, double precision, double precision, double precision)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.trg_fn_publicacion_recalcular_distancias()
  SET search_path = public, pg_temp;
