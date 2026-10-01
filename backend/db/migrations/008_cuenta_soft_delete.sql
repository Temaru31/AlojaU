-- AlojaU - 008: soft-delete de cuentas (v13.1). Espejo SQL de alembic 008.
-- Aditivo e idempotente (IF NOT EXISTS). Aplicar: psql $DATABASE_URL -f 008_cuenta_soft_delete.sql
BEGIN;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS eliminado_en TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_usuarios_eliminado ON usuarios(eliminado_en);

COMMIT;
