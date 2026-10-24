-- =============================================================================
-- AlojaU - 006_barrio_texto (flexi-barrios, v10)
-- Archivo: backend/db/migrations/006_barrio_texto.sql
-- Ejecutar en: Supabase Dashboard -> SQL Editor (después de la 005).
-- Equivale a alembic 006_barrio_texto. Idempotente y sin datos ficticios.
--
-- QUÉ HACE:
--   1. publicaciones.barrio_texto VARCHAR(120) NULL (barrio personalizado).
--   2. publicaciones.zona_barrio_id pasa a NULL (zona del catálogo OPCIONAL:
--      o zona o texto libre; lo valida Pydantic, no un CHECK).
-- Los avisos con barrio libre no tienen ciudad inferida (filtros de ciudad y
-- cercanía los omiten); el trigger 004 los ignora sin filas de distancia.
-- =============================================================================
BEGIN;

ALTER TABLE publicaciones ADD COLUMN IF NOT EXISTS barrio_texto VARCHAR(120);
ALTER TABLE publicaciones ALTER COLUMN zona_barrio_id DROP NOT NULL;

COMMIT;

-- Verificación:
-- SELECT column_name, is_nullable FROM information_schema.columns
--  WHERE table_name = 'publicaciones' AND column_name IN ('zona_barrio_id','barrio_texto');
--   -> zona_barrio_id YES, barrio_texto YES
