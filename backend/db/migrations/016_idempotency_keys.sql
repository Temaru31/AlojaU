-- AlojaU - 016: claves de idempotencia para escrituras (Bloque 2).
-- Permite reintentar POST /api/publicaciones de forma segura: misma clave
-- + usuario + ruta devuelven la respuesta original sin duplicar. Espejo SQL
-- de alembic 016. Aditivo e idempotente. Aplicar: psql $DATABASE_URL -f 016_idempotency_keys.sql
BEGIN;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  clave VARCHAR(64) NOT NULL,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ruta VARCHAR(120) NOT NULL,
  codigo INTEGER NOT NULL DEFAULT 201,
  cuerpo JSONB NOT NULL,
  expira_en TIMESTAMPTZ NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (clave, usuario_id, ruta)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expira ON idempotency_keys(expira_en);

COMMIT;
