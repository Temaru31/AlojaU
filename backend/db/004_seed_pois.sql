-- =============================================================================
-- AlojaU - 004: seed de POIs para BASES EXISTENTES (prod/dev con datos).
-- ⚠️ NUNCA ejecutes seed.sql en producción (hace TRUNCATE). Usa ESTE archivo:
-- solo INSERTs idempotentes (ON CONFLICT DO NOTHING), sin ids fijos.
-- Orden: 1) 004_pois_categoria.sql  2) ESTE archivo  3) verificar_pois_004_supabase.sql
-- =============================================================================

-- 4 POIs Popayán (coords aproximadas; recalibrar con scripts/ingest_pois_osm.py).
INSERT INTO campus_universitarios (ciudad_id, institucion, nombre_sede, direccion, latitud, longitud, categoria) VALUES
(1, 'Centro Comercial Campanario', 'Sede Única', 'Carrera 9 # 24N-43', 2.4467000, -76.6014000, 'CENTRO_COMERCIAL'),
(1, 'Hospital Universitario San José', 'Sede Principal', 'Carrera 6 # 10N-142', 2.4510000, -76.5990000, 'SALUD'),
(1, 'Terminal de Transportes', 'Sede Única', 'Transversal 9 # 4N-125', 2.4505000, -76.6130000, 'TRANSPORTE'),
(1, 'Parque Caldas', 'Centro Histórico', 'Parque Caldas Centro', 2.4418000, -76.6064000, 'OTRO')
ON CONFLICT DO NOTHING;

-- Distancias de TODAS las pubs con coords a los POIs nuevos (NULL-safe).
INSERT INTO publicacion_campus (publicacion_id, campus_id, distancia_geodesica_m)
SELECT p.id, c.id, haversine_m(p.latitud, p.longitud, c.latitud, c.longitud)
FROM publicaciones p
JOIN campus_universitarios c ON c.categoria <> 'UNIVERSIDAD' AND c.activo = TRUE
WHERE p.latitud IS NOT NULL AND p.longitud IS NOT NULL
ON CONFLICT DO NOTHING;

-- Comprobación inmediata (debe dar 4 filas y N distancias).
SELECT categoria, COUNT(*) FROM campus_universitarios
WHERE categoria <> 'UNIVERSIDAD' GROUP BY categoria ORDER BY categoria;
