-- =============================================================================
-- AlojaU - 021: capa de datos de SOLO LECTURA para el chatbot (rol + vistas).
-- Espejo Alembic: backend/alembic/versions/021_chatbot_readonly.py
-- (mismo efecto; el .sql manda en Supabase/CI, el .py en `alembic upgrade`).
-- Idempotente: se puede re-ejecutar sin daño (CREATE OR REPLACE, IF NOT EXISTS,
-- REVOKE/GRANT repetibles, ALTER ROLE SET repetible).
--
-- QUÉ CREA
--   Rol `chatbot_ro` (NOLOGIN por defecto) con:
--     - CONNECTION LIMIT 5, statement_timeout 3s, default_transaction_read_only=on
--     - USAGE en el esquema + SELECT SOLO sobre las 9 vistas chat_v_*.
--     - REVOKE de TODO lo demás (tablas, secuencias, esquema).
--   9 vistas `chat_v_*` (security_barrier, dueño privilegiado):
--     chat_v_publicaciones (+ trust sin PII: tiene_telefono bool, num_fotos,
--       num_reportes_activos agregado; SOLO estado='ACTIVO' y dueño no eliminado)
--     chat_v_publicacion_servicios, chat_v_publicacion_campus, chat_v_imagenes
--     chat_v_campus, chat_v_ciudades, chat_v_zonas, chat_v_housing_types,
--     chat_v_servicios
--
-- REQUISITO: migraciones 005–020 aplicadas (el bloque 0 lo comprueba y falla
-- con mensaje claro si falta algo; en prod pegar 005–020 primero en el
-- SQL Editor, NUNCA seed.sql). Verifica además vistas_dedup + FKs clave.
--
-- ACTIVAR EL ROL (manual, UNA vez, como superuser en el SQL Editor):
--   ALTER ROLE chatbot_ro WITH LOGIN PASSWORD '<secreto-fuerte>';
-- (el secreto va a Render como parte de CHAT_DATABASE_URL, NUNCA al repo)
--   CHAT_DATABASE_URL=postgresql+asyncpg://chatbot_ro.<project-ref>:<secreto>
--     @aws-0-us-east-2.pooler.supabase.com:5432/postgres
-- (pooler de Supabase: el usuario lleva el sufijo .<project-ref>).
-- Sin CHAT_DATABASE_URL el chatbot responde deshabilitado (fail-closed).
--
-- DOWNGRADE (revierte vistas y privilegios; el rol se conserva deshabilitado
-- salvo DROP explícito, para no romper sesiones/secretos por accidente) -----
-- DROP VIEW IF EXISTS chat_v_servicios;
-- DROP VIEW IF EXISTS chat_v_housing_types;
-- DROP VIEW IF EXISTS chat_v_zonas;
-- DROP VIEW IF EXISTS chat_v_ciudades;
-- DROP VIEW IF EXISTS chat_v_campus;
-- DROP VIEW IF EXISTS chat_v_imagenes;
-- DROP VIEW IF EXISTS chat_v_publicacion_campus;
-- DROP VIEW IF EXISTS chat_v_publicacion_servicios;
-- DROP VIEW IF EXISTS chat_v_publicaciones;
-- (opcional, con el rol sin sesiones activas ni objetos propios)
-- REVOKE ALL ON SCHEMA public FROM chatbot_ro;
-- DROP ROLE IF EXISTS chatbot_ro;
-- =============================================================================

-- BLOQUE 0: comprobar 005–020 aplicadas (+ vistas_dedup y FKs clave). -------
DO $$
DECLARE
  faltantes TEXT[] := '{}';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'system_settings')
    THEN faltantes := faltantes || '005:system_settings'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'publicaciones'
                   AND column_name = 'barrio_texto')
    THEN faltantes := faltantes || '006:publicaciones.barrio_texto'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'usuarios'
                   AND column_name = 'eliminado_en')
    THEN faltantes := faltantes || '008:usuarios.eliminado_en'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'vistas_dedup')
    THEN faltantes := faltantes || '011:vistas_dedup'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE table_schema = 'public' AND table_name = 'vistas_dedup'
                   AND constraint_name = 'uq_vista_pub_marca')
    THEN faltantes := faltantes || '011:uq_vista_pub_marca'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'housing_types')
    THEN faltantes := faltantes || '013:housing_types'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'usuarios'
                   AND column_name = 'telegram_chat_id')
    THEN faltantes := faltantes || '014:usuarios.telegram_chat_id'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'telegram_vinculos')
    THEN faltantes := faltantes || '015:telegram_vinculos'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'idempotency_keys')
    THEN faltantes := faltantes || '016:idempotency_keys'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'busquedas_guardadas')
    THEN faltantes := faltantes || '019:busquedas_guardadas'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'notificaciones')
    THEN faltantes := faltantes || '019:notificaciones'; END IF;
  -- FKs clave verificadas (nombres del DDL canónico).
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE table_schema = 'public' AND table_name = 'publicaciones'
                   AND constraint_type = 'FOREIGN KEY')
    THEN faltantes := faltantes || 'FKs:publicaciones sin FOREIGN KEY'; END IF;
  IF array_length(faltantes, 1) IS NOT NULL THEN
    RAISE EXCEPTION '021 ABORTADA: faltan objetos de migraciones 005-020: %. Aplícalas primero (SQL Editor, en orden).',
      array_to_string(faltantes, ', ');
  END IF;
  RAISE NOTICE '021 OK: pre-chequeo 005-020 superado.';
END $$;

-- BLOQUE 1: rol (NOLOGIN; el LOGIN+password es paso manual documentado). -----
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chatbot_ro') THEN
    CREATE ROLE chatbot_ro WITH NOLOGIN CONNECTION LIMIT 5;
  END IF;
END $$;
ALTER ROLE chatbot_ro WITH CONNECTION LIMIT 5;
ALTER ROLE chatbot_ro SET statement_timeout = '3s';
ALTER ROLE chatbot_ro SET default_transaction_read_only = on;

-- BLOQUE 2: vistas públicas (security_barrier; solo columnas sin PII). ------
-- NUNCA exponer: telefono_whatsapp, email, password_hash, supabase_id,
-- ip_consentimiento, telegram_chat_id, otp/recovery, sesiones, reportes
-- (filas), auditoría, system_settings. El trust llega como agregados.

CREATE OR REPLACE VIEW chat_v_publicaciones WITH (security_barrier = true) AS
SELECT p.id,
       p.titulo,
       p.descripcion,
       p.tipo_inmueble,
       p.canon_mensual,
       p.deposito_requerido,
       p.incluye_servicios_base,
       p.reglas_convivencia,
       p.direccion_referencial,
       p.latitud,
       p.longitud,
       p.fecha_publicacion,
       p.fecha_renovacion,
       p.fecha_expiracion,
       p.zona_barrio_id,
       p.barrio_texto,
       zb.nombre AS zona_nombre,
       c.nombre AS ciudad_nombre,
       -- Trust sin PII: solo booleanos y conteos agregados.
       (u.telefono_verificado AND u.telefono_whatsapp IS NOT NULL) AS tiene_telefono,
       (SELECT COUNT(*) FROM imagenes_publicacion i
         WHERE i.publicacion_id = p.id) AS num_fotos,
       (SELECT COUNT(*) FROM reportes_publicacion r
         WHERE r.publicacion_id = p.id
           AND r.estado IN ('PENDIENTE', 'CONFIRMADO')) AS num_reportes_activos
FROM publicaciones p
LEFT JOIN zonas_barrios zb ON zb.id = p.zona_barrio_id
LEFT JOIN ciudades c ON c.id = zb.ciudad_id
JOIN usuarios u ON u.id = p.usuario_id AND u.eliminado_en IS NULL
WHERE p.estado = 'ACTIVO';

CREATE OR REPLACE VIEW chat_v_publicacion_servicios WITH (security_barrier = true) AS
SELECT ps.publicacion_id,
       ps.servicio_id,
       s.nombre AS servicio_nombre
FROM publicacion_servicios ps
JOIN servicios_catalogo s ON s.id = ps.servicio_id
JOIN publicaciones p ON p.id = ps.publicacion_id AND p.estado = 'ACTIVO';

CREATE OR REPLACE VIEW chat_v_publicacion_campus WITH (security_barrier = true) AS
SELECT pc.publicacion_id,
       pc.campus_id,
       pc.distancia_geodesica_m AS distancia_m
FROM publicacion_campus pc
JOIN publicaciones p ON p.id = pc.publicacion_id AND p.estado = 'ACTIVO';

CREATE OR REPLACE VIEW chat_v_imagenes WITH (security_barrier = true) AS
SELECT i.publicacion_id,
       i.url,
       i.orden
FROM imagenes_publicacion i
JOIN publicaciones p ON p.id = i.publicacion_id AND p.estado = 'ACTIVO';

CREATE OR REPLACE VIEW chat_v_campus WITH (security_barrier = true) AS
SELECT id, ciudad_id, institucion, nombre_sede, direccion,
       latitud, longitud, categoria
FROM campus_universitarios
WHERE activo IS TRUE;

CREATE OR REPLACE VIEW chat_v_ciudades WITH (security_barrier = true) AS
SELECT id, nombre, departamento
FROM ciudades
WHERE activo IS TRUE;

CREATE OR REPLACE VIEW chat_v_zonas WITH (security_barrier = true) AS
SELECT id, ciudad_id, nombre, estrato
FROM zonas_barrios;

CREATE OR REPLACE VIEW chat_v_housing_types WITH (security_barrier = true) AS
SELECT slug, nombre_visible, descripcion_tooltip, icono
FROM housing_types
WHERE esta_activo IS TRUE;

CREATE OR REPLACE VIEW chat_v_servicios WITH (security_barrier = true) AS
SELECT id, nombre, categoria
FROM servicios_catalogo;

-- BLOQUE 3: lockdown del rol (revocar todo, conceder solo las vistas). ------
-- (Las tablas nuevas niegan por defecto: PUBLIC no tiene SELECT en PG15+.)
REVOKE ALL ON SCHEMA public FROM chatbot_ro;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM chatbot_ro;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM chatbot_ro;
GRANT USAGE ON SCHEMA public TO chatbot_ro;
GRANT SELECT ON chat_v_publicaciones TO chatbot_ro;
GRANT SELECT ON chat_v_publicacion_servicios TO chatbot_ro;
GRANT SELECT ON chat_v_publicacion_campus TO chatbot_ro;
GRANT SELECT ON chat_v_imagenes TO chatbot_ro;
GRANT SELECT ON chat_v_campus TO chatbot_ro;
GRANT SELECT ON chat_v_ciudades TO chatbot_ro;
GRANT SELECT ON chat_v_zonas TO chatbot_ro;
GRANT SELECT ON chat_v_housing_types TO chatbot_ro;
GRANT SELECT ON chat_v_servicios TO chatbot_ro;
