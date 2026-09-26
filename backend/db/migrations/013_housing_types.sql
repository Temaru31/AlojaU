-- AlojaU - 013: tipos de vivienda dinámicos (M2). Espejo SQL de alembic 013.
-- Aditivo e idempotente. Aplicar en Supabase prod: psql $DATABASE_URL -f 013_housing_types.sql
-- - Crea housing_types(slug PK, nombre_visible, descripcion_tooltip, icono, esta_activo).
-- - Backfill con los slugs históricos (PROHIBIDO renombrar/eliminar):
--   los 4 del contrato actual (HABITACION_FAMILIAR, HABITACION_INDEPENDIENTE,
--   APARTAESTUDIO, COMPARTIDO) + los 3 alias del sprint
--   (APARTAMENTO_COMPLETO, HABITACION_PISO_COMPARTIDO) para retrocompatibilidad.
-- - Reemplaza CHECK chk_tipo por FK RESTRICT (evita borrar slugs en uso).
BEGIN;

CREATE TABLE IF NOT EXISTS housing_types (
  slug VARCHAR(40) PRIMARY KEY,
  nombre_visible VARCHAR(80) NOT NULL,
  descripcion_tooltip TEXT,
  icono VARCHAR(20),
  esta_activo BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO housing_types (slug, nombre_visible, descripcion_tooltip, icono, esta_activo) VALUES
  ('HABITACION_FAMILIAR', 'Habitación familiar', 'Habitación en casa de familia, ambiente compartido', '🏠', TRUE),
  ('HABITACION_INDEPENDIENTE', 'Habitación independiente', 'Habitación privada con acceso independiente', '🚪', TRUE),
  ('APARTAESTUDIO', 'Apartaestudio', 'Ambiente integrado con cocina y baño privados', '🏢', TRUE),
  ('COMPARTIDO', 'Compartido', 'Cupo en vivienda compartida con otros estudiantes', '🤝', TRUE),
  ('APARTAMENTO_COMPLETO', 'Apartamento completo', 'Apartamento entero para ti o tu grupo', '🏘️', TRUE),
  ('HABITACION_PISO_COMPARTIDO', 'Habitación en piso compartido', 'Habitación privada en piso con zonas comunes', '🏡', TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Asegura que todo tipo en uso exista en el catálogo (por si hay drift).
-- No borra ni renombra slugs: solo inserta los que falten (ya cubiertos arriba).

-- Reemplaza CHECK estático por FK RESTRICT (idempotente).
ALTER TABLE publicaciones DROP CONSTRAINT IF EXISTS chk_tipo;
-- El DDL histórico vía schema.sql creó el CHECK sin nombre explícito.
ALTER TABLE publicaciones DROP CONSTRAINT IF EXISTS publicaciones_tipo_inmueble_check;
-- FK RESTRICT: impide borrar un slug en uso (ON DELETE RESTRICT).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_publicaciones_tipo') THEN
    ALTER TABLE publicaciones ADD CONSTRAINT fk_publicaciones_tipo
      FOREIGN KEY (tipo_inmueble) REFERENCES housing_types(slug)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

COMMIT;
