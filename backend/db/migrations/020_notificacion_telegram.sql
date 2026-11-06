-- 020 tipo 'telegram' en notificaciones (bienvenida al vincular).
-- Espejo manual de backend/alembic/versions/020_notificacion_telegram.py
-- para aplicar en Supabase (SQL Editor). Idempotente.
-- UPGRADE ----------------------------------------------------------------
ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS chk_notif_tipo;
ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE notificaciones ADD CONSTRAINT chk_notif_tipo
  CHECK (tipo IN ('nuevo_arriendo','moderacion','vencimiento','telegram'));

-- DOWNGRADE (solo si no hay filas 'telegram'; si las hay, falla a propósito
-- antes que dejar datos inválidos) ----------------------------------------
-- ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS chk_notif_tipo;
-- ALTER TABLE notificaciones ADD CONSTRAINT chk_notif_tipo
--   CHECK (tipo IN ('nuevo_arriendo','moderacion','vencimiento'));
