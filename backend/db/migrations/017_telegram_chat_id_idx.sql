-- AlojaU - 017: índice + check para telegram_chat_id (Bloque 1 fix).
-- telegram_chat_id es VARCHAR(32): soporta IDs de 64 bits sin overflow de
-- INTEGER 32 bits. Migración aditiva e idempotente.
-- Aplicar: psql $DATABASE_URL -f 017_telegram_chat_id_idx.sql
BEGIN;

CREATE INDEX IF NOT EXISTS idx_usuarios_telegram_chat
  ON usuarios(telegram_chat_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_telegram_chat_fmt'
  ) THEN
    ALTER TABLE usuarios ADD CONSTRAINT chk_telegram_chat_fmt
      CHECK (telegram_chat_id IS NULL OR telegram_chat_id ~ '^-?[0-9]{5,20}$');
  END IF;
END
$$;

COMMIT;
