-- =============================================================================
-- AlojaU - 004: POIs por categoría (lugares de interés) — 100% ADITIVO
-- Archivo canónico: backend/db/004_pois_categoria.sql
-- Aplicar en: Supabase SQL Editor, psql local, o `alembic upgrade head` (004).
-- Idempotente: re-ejecutable sin errores (IF NOT EXISTS / OR REPLACE).
--
-- DECISIÓN DE ARQUITECTURA (no renombrar tablas): `campus_universitarios` y
-- `publicacion_campus` se CONSERVAN (RLS Supabase, seed.sql, ORM, tests y docs
-- usan esos nombres). Los POIs se modelan como columna `categoria` + filas
-- nuevas. El contrato `?campus_id=` no cambia: ahora acepta cualquier lugar.
-- =============================================================================
BEGIN;

-- 1. Columna categoria (UNIVERSIDAD por defecto = filas existentes intactas)
ALTER TABLE campus_universitarios
  ADD COLUMN IF NOT EXISTS categoria VARCHAR(50) NOT NULL DEFAULT 'UNIVERSIDAD';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_campus_categoria') THEN
    ALTER TABLE campus_universitarios
      ADD CONSTRAINT chk_campus_categoria
      CHECK (categoria IN ('UNIVERSIDAD','CENTRO_COMERCIAL','SALUD','TRANSPORTE','OTRO'));
  END IF;
END $$;

-- 2. Índice para el listado agrupado por categoría (GET /api/campus)
CREATE INDEX IF NOT EXISTS idx_campus_ciudad_categoria
  ON campus_universitarios(ciudad_id, categoria);

-- 3. Trigger: recalcula distancias al insertar o mover una publicación.
--    - Con coords: upsert de TODOS los lugares activos de la misma ciudad
--      (ON CONFLICT: convive con las filas que inserta el repo al publicar).
--    - Sin coords (NULL, B0-5): marca dist NULL sin borrar la asociación,
--      para que el aviso siga listando (NULLS LAST) en vez de desaparecer.
CREATE OR REPLACE FUNCTION trg_fn_publicacion_recalcular_distancias()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.latitud IS NULL OR NEW.longitud IS NULL THEN
    UPDATE publicacion_campus
       SET distancia_geodesica_m = NULL
     WHERE publicacion_id = NEW.id;
    RETURN NEW;
  END IF;
  INSERT INTO publicacion_campus (publicacion_id, campus_id, distancia_geodesica_m)
  SELECT NEW.id, c.id,
         haversine_m(NEW.latitud, NEW.longitud, c.latitud, c.longitud)
    FROM campus_universitarios c
    JOIN zonas_barrios z ON z.ciudad_id = c.ciudad_id
    JOIN publicaciones p ON p.id = NEW.id AND p.zona_barrio_id = z.id
   WHERE c.activo = TRUE
  ON CONFLICT (publicacion_id, campus_id)
  DO UPDATE SET distancia_geodesica_m = EXCLUDED.distancia_geodesica_m;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_publicacion_recalcular_distancias ON publicaciones;
CREATE TRIGGER trg_publicacion_recalcular_distancias
AFTER INSERT OR UPDATE OF latitud, longitud ON publicaciones
FOR EACH ROW EXECUTE FUNCTION trg_fn_publicacion_recalcular_distancias();

COMMIT;
