-- AlojaU Oleada 2 — Búsqueda por texto (pegar en Supabase SQL Editor).
-- Equivale a alembic 003_busqueda_fts. Idempotente: se puede correr 2 veces.
-- Tarda segundos y NO bloquea lecturas (CREATE INDEX sin CONCURRENTLY toma
-- un lock breve de escritura; córrelo en horario valle si hay tráfico).

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE INDEX IF NOT EXISTS idx_publicaciones_fts ON publicaciones
USING gin(to_tsvector('spanish', coalesce(titulo, '') || ' ' || coalesce(descripcion, '')));

CREATE INDEX IF NOT EXISTS idx_publicaciones_trgm ON publicaciones
USING gin(titulo gin_trgm_ops);

-- Verificación (deben devolver 1 fila cada una):
-- SELECT * FROM pg_indexes WHERE indexname = 'idx_publicaciones_fts';
-- SELECT * FROM pg_indexes WHERE indexname = 'idx_publicaciones_trgm';
-- Smoke test FTS (ajusta la palabra a tus datos):
-- SELECT id, titulo FROM publicaciones
--  WHERE to_tsvector('spanish', titulo || ' ' || descripcion)
--        @@ websearch_to_tsquery('spanish', 'habitacion')
--  LIMIT 5;
