-- AlojaU - 015: vinculación Telegram persistente (Bloque 2).
-- Los nonces HMAC vivían solo en memoria (_TELEGRAM_VINCULOS): un redeploy
-- o segunda instancia invalidaba vinculaciones en curso. Espejo SQL de
-- alembic 015. Aditivo e idempotente. Aplicar: psql $DATABASE_URL -f 015_telegram_vinculos.sql
BEGIN;

CREATE TABLE IF NOT EXISTS telegram_vinculos (
  nonce VARCHAR(32) PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_en TIMESTAMPTZ NOT NULL,
  usado BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_telegram_vinculos_expira ON telegram_vinculos(expira_en);

COMMIT;
