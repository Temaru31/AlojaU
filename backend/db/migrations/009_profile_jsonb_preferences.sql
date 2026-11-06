-- AlojaU - 009: perfil flexible marketplace (v13.2). Espejo SQL de alembic 009.
-- Aditivo e idempotente (IF NOT EXISTS). Aplicar: psql $DATABASE_URL -f 009_profile_jsonb_preferences.sql
BEGIN;

ALTER TABLE usuarios ALTER COLUMN telefono_whatsapp DROP NOT NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bio VARCHAR(500);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_perfil_url VARCHAR(500);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS preferencias JSONB
  NOT NULL DEFAULT '{}';

-- Backfill seguro: el placeholder de Google sin teléfono -> NULL real
-- (sin esto el gate 400 de publicación nunca se dispararía).
UPDATE usuarios SET telefono_whatsapp = NULL
WHERE telefono_whatsapp = '573000000000';

COMMIT;
