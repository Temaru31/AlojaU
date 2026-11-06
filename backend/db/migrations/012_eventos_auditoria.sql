-- AlojaU - 012: nuevos eventos de auditoría (M4 historial). Espejo SQL de alembic 012.
-- Aditivo e idempotente (DROP IF EXISTS + ADD). Aplicar: psql $DATABASE_URL -f 012_eventos_auditoria.sql
BEGIN;

ALTER TABLE publicaciones_audit DROP CONSTRAINT IF EXISTS chk_evento;
-- El DDL histórico creó el CHECK sin nombre (PG: publicaciones_audit_evento_check).
ALTER TABLE publicaciones_audit DROP CONSTRAINT IF EXISTS publicaciones_audit_evento_check;
ALTER TABLE publicaciones_audit ADD CONSTRAINT chk_evento CHECK (
  evento IN ('CREATED','APPROVED','REJECTED','PAUSED','RESUMED','RENTED','EXPIRED','RENEWED','BLOCKED','SETTINGS','CUENTA_DELETE')
);
-- Un acto auditado no siempre refiere a un aviso (ajustes, cuentas).
ALTER TABLE publicaciones_audit ALTER COLUMN publicacion_id DROP NOT NULL;

COMMIT;
