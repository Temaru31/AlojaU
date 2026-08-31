-- =============================================================================
-- AlojaU - HAVERSINE: Cálculo distancia_geodesica_m para publicacion_campus
-- Archivo: backend/db/haversine.sql
-- Uso: 1) función SQL haversine_m (ya creada en schema.sql)
--      2) ejemplos de UPDATE masivo / trigger / verificación
-- =============================================================================

-- 1. Función (si no ejecutaste schema.sql, créala aquí)
CREATE OR REPLACE FUNCTION haversine_m(
    lat1 DOUBLE PRECISION, lon1 DOUBLE PRECISION,
    lat2 DOUBLE PRECISION, lon2 DOUBLE PRECISION
) RETURNS INTEGER
LANGUAGE plpgsql IMMUTABLE STRICT
AS $$
DECLARE
    R CONSTANT DOUBLE PRECISION := 6371000;
    dlat DOUBLE PRECISION := radians(lat2 - lat1);
    dlon DOUBLE PRECISION := radians(lon2 - lon1);
    a DOUBLE PRECISION;
    c DOUBLE PRECISION;
BEGIN
    a := sin(dlat/2)^2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)^2;
    c := 2 * asin(sqrt(a));
    RETURN (R * c)::INTEGER;
END;
$$;

-- 2. Tests unitarios (distancias conocidas Popayán)
--    Tulcán 2.443/-76.606 vs Centro 2.441/-76.606 = ~222m en latitud
SELECT haversine_m(2.443, -76.606, 2.441, -76.606) AS tulcan_a_centro; -- esperado 222
SELECT haversine_m(2.444, -76.606, 2.443, -76.606) AS pub1_a_tulcan;   -- esperado 111
SELECT haversine_m(2.4415, -76.6055, 2.441, -76.606) AS pub3_a_centro;  -- esperado 79

-- 3. Recalcular TODAS las distancias tras insertar/actualizar publicaciones o campus
--    (útil tras seed o si corriges coordenadas)
--    Ejecuta este bloque después de cambiar lat/lon:
UPDATE publicacion_campus pc
SET distancia_geodesica_m = haversine_m(p.latitud, p.longitud, c.latitud, c.longitud),
    actualizado_en = NOW()
FROM publicaciones p, campus_universitarios c
WHERE pc.pub_id = p.id
  AND pc.campus_id = c.id
  AND p.latitud IS NOT NULL AND p.longitud IS NOT NULL;

-- 4. Insertar distancia al crear publicación (ejemplo en INSERT)
--    INSERT INTO publicaciones (...) VALUES (...) RETURNING id INTO new_id;
--    INSERT INTO publicacion_campus (pub_id, campus_id, distancia_geodesica_m)
--    SELECT new_id, c.id, haversine_m(new_lat, new_lon, c.latitud, c.longitud)
--    FROM campus_universitarios c WHERE c.activo = TRUE;

-- 5. Query HU-001: buscar publicaciones ACTIVAS por campus ordenadas por distancia + filtros
--    GET /api/publicaciones?campus_id=1&precio_min=400000&precio_max=700000&servicios=1,2
SELECT
    p.id, p.titulo, p.canon_mensual, p.tipo_inmueble, p.indice_confianza,
    zb.nombre AS zona,
    pc.distancia_geodesica_m,
    (SELECT COUNT(*) FROM imagenes_publicacion i WHERE i.publicacion_id=p.id) AS num_fotos,
    p.latitud, p.longitud
FROM publicaciones p
JOIN zonas_barrios zb ON zb.id = p.zona_barrio_id
JOIN publicacion_campus pc ON pc.pub_id = p.id AND pc.campus_id = :campus_id
WHERE p.estado = 'ACTIVO'
  AND (:precio_min IS NULL OR p.canon_mensual >= :precio_min)
  AND (:precio_max IS NULL OR p.canon_mensual <= :precio_max)
  AND (:tipo IS NULL OR p.tipo_inmueble = :tipo)
  -- filtro servicios: que tenga todos los solicitados
  AND (
    :servicios IS NULL
    OR NOT EXISTS (
        SELECT 1 FROM unnest(:servicios::bigint[]) s(sid)
        WHERE NOT EXISTS (SELECT 1 FROM publicacion_servicios ps WHERE ps.pub_id=p.id AND ps.servicio_id=s.sid)
    )
  )
ORDER BY pc.distancia_geodesica_m ASC, p.indice_confianza DESC, p.canon_mensual ASC
LIMIT 20;

-- 6. Verificar que trigger mantiene coherencia tras UPDATE lat/lon
--    UPDATE publicaciones SET latitud=2.4445, longitud=-76.6050 WHERE id=1;
--    SELECT * FROM publicacion_campus WHERE pub_id=1;

-- 7. Vista desglose índice confianza en vivo (corrige bug Factor5)
--    SELECT * FROM v_publicaciones_indice WHERE id IN (1,2,4);
