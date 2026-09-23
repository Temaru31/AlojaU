-- AlojaU - 010: FK ON DELETE + secuencias (v14.1). Espejo SQL de alembic 010.
-- Alinea DDL con los modelos. Idempotente (DROP IF EXISTS + ADD).
-- Aplicar: psql $DATABASE_URL -f 010_fk_cascade_and_sequences.sql
BEGIN;

ALTER TABLE zonas_barrios DROP CONSTRAINT IF EXISTS zonas_barrios_ciudad_id_fkey;
ALTER TABLE zonas_barrios ADD CONSTRAINT zonas_barrios_ciudad_id_fkey
  FOREIGN KEY (ciudad_id) REFERENCES ciudades(id) ON DELETE CASCADE;

ALTER TABLE campus_universitarios DROP CONSTRAINT IF EXISTS campus_universitarios_ciudad_id_fkey;
ALTER TABLE campus_universitarios ADD CONSTRAINT campus_universitarios_ciudad_id_fkey
  FOREIGN KEY (ciudad_id) REFERENCES ciudades(id) ON DELETE CASCADE;

ALTER TABLE publicaciones DROP CONSTRAINT IF EXISTS publicaciones_usuario_id_fkey;
ALTER TABLE publicaciones ADD CONSTRAINT publicaciones_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;

ALTER TABLE publicacion_servicios DROP CONSTRAINT IF EXISTS publicacion_servicios_servicio_id_fkey;
ALTER TABLE publicacion_servicios ADD CONSTRAINT publicacion_servicios_servicio_id_fkey
  FOREIGN KEY (servicio_id) REFERENCES servicios_catalogo(id) ON DELETE CASCADE;

ALTER TABLE publicacion_campus DROP CONSTRAINT IF EXISTS publicacion_campus_campus_id_fkey;
ALTER TABLE publicacion_campus ADD CONSTRAINT publicacion_campus_campus_id_fkey
  FOREIGN KEY (campus_id) REFERENCES campus_universitarios(id) ON DELETE CASCADE;

ALTER TABLE reportes_publicacion DROP CONSTRAINT IF EXISTS reportes_publicacion_usuario_id_fkey;
ALTER TABLE reportes_publicacion ADD CONSTRAINT reportes_publicacion_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL;

ALTER TABLE publicaciones_audit DROP CONSTRAINT IF EXISTS publicaciones_audit_usuario_id_fkey;
ALTER TABLE publicaciones_audit ADD CONSTRAINT publicaciones_audit_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL;

SELECT setval('ciudades_id_seq', COALESCE((SELECT max(id) FROM ciudades), 1), true);
SELECT setval('zonas_barrios_id_seq', COALESCE((SELECT max(id) FROM zonas_barrios), 1), true);
SELECT setval('campus_universitarios_id_seq', COALESCE((SELECT max(id) FROM campus_universitarios), 1), true);
SELECT setval('servicios_catalogo_id_seq', COALESCE((SELECT max(id) FROM servicios_catalogo), 1), true);
SELECT setval('usuarios_id_seq', COALESCE((SELECT max(id) FROM usuarios), 1), true);
SELECT setval('publicaciones_id_seq', COALESCE((SELECT max(id) FROM publicaciones), 1), true);
SELECT setval('reportes_publicacion_id_seq', COALESCE((SELECT max(id) FROM reportes_publicacion), 1), true);
SELECT setval('imagenes_publicacion_id_seq', COALESCE((SELECT max(id) FROM imagenes_publicacion), 1), true);
SELECT setval('publicaciones_audit_id_seq', COALESCE((SELECT max(id) FROM publicaciones_audit), 1), true);

COMMIT;
