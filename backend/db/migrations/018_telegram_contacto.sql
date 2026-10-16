-- AlojaU - 018: chat pendiente para verificación por contacto (Opción A).
-- El /start ya no vincula directo: guarda el chat que pidió el enlace y
-- espera el contacto compartido (request_contact) para comparar números.
-- Aditiva e idempotente.
-- Aplicar: psql $DATABASE_URL -f 018_telegram_contacto.sql
BEGIN;

ALTER TABLE telegram_vinculos
  ADD COLUMN IF NOT EXISTS chat_id_pendiente VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_telegram_vinculos_chat
  ON telegram_vinculos(chat_id_pendiente);

COMMIT;
