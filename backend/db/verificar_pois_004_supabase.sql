-- =============================================================================
-- AlojaU - Verificación 004 POIs (pegar en Supabase SQL Editor TRAS aplicar
-- backend/db/004_pois_categoria.sql + seed de POIs). Solo lectura salvo el
-- bloque 4 (usa transacción con ROLLBACK: no deja basura).
-- Criterio auditor: bloque 1 debe mostrar Index Scan con idx_pubcampus_* y
-- bloque 2 debe listar el trigger. DB < 15 ms en el plan del bloque 1.
-- =============================================================================

-- 1. Performance: el listado por lugar USA el índice B-Tree (campus_id, dist).
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, p.titulo, pc.distancia_geodesica_m
FROM publicaciones p
JOIN publicacion_campus pc
  ON pc.publicacion_id = p.id AND pc.campus_id = 1
WHERE p.estado = 'ACTIVO'
ORDER BY pc.distancia_geodesica_m ASC NULLS LAST, p.id ASC
LIMIT 9;

-- 2. Trigger instalado y activo.
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgname = 'trg_publicacion_recalcular_distancias';

-- 3. POIs por categoría + cobertura de distancias (6 pubs x N lugares).
SELECT categoria, COUNT(*) AS lugares
FROM campus_universitarios WHERE activo = TRUE GROUP BY categoria ORDER BY categoria;
SELECT COUNT(*) AS filas_pub_lugar FROM publicacion_campus;
SELECT COUNT(*) AS pubs_sin_ninguna_fila
FROM publicaciones p
WHERE NOT EXISTS (SELECT 1 FROM publicacion_campus pc WHERE pc.publicacion_id = p.id);

-- 4. Trigger en acción (transaccional: ROLLBACK al final, sin efectos).
BEGIN;
UPDATE publicaciones SET latitud = 2.4445, longitud = -76.6050 WHERE id = 1;
SELECT campus_id, distancia_geodesica_m
FROM publicacion_campus WHERE publicacion_id = 1 ORDER BY campus_id;
ROLLBACK;

-- 5. Edge case NULL: aviso sin coords conserva filas con dist NULL (no desaparece).
SELECT publicacion_id, campus_id, distancia_geodesica_m
FROM publicacion_campus WHERE distancia_geodesica_m IS NULL LIMIT 5;
