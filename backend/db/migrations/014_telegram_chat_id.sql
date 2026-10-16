-- AlojaU - 014: Telegram DM $0 (M5 privacidad). Espejo SQL de alembic 014.
-- Aditivo e idempotente. Aplicar en Supabase prod: psql $DATABASE_URL -f 014_telegram_chat_id.sql
-- - usuarios.telegram_chat_id VARCHAR(32) NULL (sin vincular = NULL).
-- - Bugfix privacidad: los OTP solo van por DM a este chat_id; NUNCA a
--   canales/grupos globales (TELEGRAM_CHAT_ID legacy no se usa para OTP).
BEGIN;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(32);

COMMIT;
