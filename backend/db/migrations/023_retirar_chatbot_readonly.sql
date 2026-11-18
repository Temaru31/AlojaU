-- =============================================================================
-- AlojaU - 023: retirar la capa de datos del chatbot (reemplaza a la 021).
-- Espejo Alembic: backend/alembic/versions/023_retirar_chatbot_readonly.py
-- (mismo efecto; el .sql manda en Supabase/CI, el .py en `alembic upgrade`).
-- Idempotente: se puede re-ejecutar sin daño (DROP ... IF EXISTS).
--
-- POR QUÉ: el chatbot dejó de consultar la base de datos; ahora solo explica
-- las funcionalidades de la app desde una base de conocimiento estática. El
-- rol `chatbot_ro` y las 9 vistas `chat_v_*` (mig 021) quedaron sin uso y
-- ampliaban la superficie de ataque.
--
-- QUÉ HACE: elimina las 9 vistas `chat_v_*` y el rol `chatbot_ro`.
-- NO toca tablas ni datos. Si el rol tiene sesiones abiertas, el DROP ROLE
-- falla: cerrarlas (o quitar el LOGIN) y re-ejecutar.
--
-- DOWNGRADE: re-aplicar 021_chatbot_readonly.sql.
-- =============================================================================

DROP VIEW IF EXISTS chat_v_servicios;
DROP VIEW IF EXISTS chat_v_housing_types;
DROP VIEW IF EXISTS chat_v_zonas;
DROP VIEW IF EXISTS chat_v_ciudades;
DROP VIEW IF EXISTS chat_v_campus;
DROP VIEW IF EXISTS chat_v_imagenes;
DROP VIEW IF EXISTS chat_v_publicacion_campus;
DROP VIEW IF EXISTS chat_v_publicacion_servicios;
DROP VIEW IF EXISTS chat_v_publicaciones;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chatbot_ro') THEN
    REVOKE ALL ON SCHEMA public FROM chatbot_ro;
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM chatbot_ro;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM chatbot_ro;
    DROP ROLE chatbot_ro;
  END IF;
END $$;
