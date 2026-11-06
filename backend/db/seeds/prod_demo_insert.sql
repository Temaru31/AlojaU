-- =============================================================================
-- AlojaU - Carga demo a PRODUCCIÓN (Supabase) SIN borrar nada (v12)
-- Archivo: backend/db/seeds/prod_demo_insert.sql
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query -> pegar -> Run.
--
-- QUÉ HACE: suma a tu base actual las 10 publicaciones demo que faltan
-- (ids 7-16: 7 ACTIVO + 3 PAUSADO_POR_REPORTE) con sus zonas, campus,
-- usuario, servicios, fotos, distancias, reportes y auditoría.
-- Tu prod con las 6 originales queda INTACTA: todo es INSERT ... ON CONFLICT
-- DO NOTHING (re-ejecutable sin duplicar ni fallar).
-- Resultado esperado: 13 ACTIVO en el home (6 + 7) y 3 pausados solo en admin.
--
-- REQUISITOS (ya cumplidos según bitácora): migraciones 005 y 006 aplicadas
-- (chk_estado de 9 estados, columna barrio_texto, system_settings, trigger
-- 004 y función haversine_m). Si algún INSERT falla por CHECK de estados,
-- aplica primero backend/db/migrations/005_fix_estado_and_campus.sql.
-- =============================================================================
BEGIN;

-- 0. Ajustes del sistema (por si 005 no los dejó; no toca valores existentes)
INSERT INTO system_settings (clave, valor, tipo, descripcion) VALUES
  ('dias_vigencia_publicacion', '30', 'int', 'Días de vigencia al publicar/renovar'),
  ('max_reportes_para_pausa_automatica', '3', 'int', 'Reportes PENDIENTE/CONFIRMADO que pausan el aviso'),
  ('auto_aprobar_arrendadores_verificados', 'false', 'bool', 'Si true, PENDIENTE de verificados pasa a ACTIVO sin cola')
ON CONFLICT (clave) DO NOTHING;

-- 1. Zonas nuevas (las 1-3 ya existen)
INSERT INTO zonas_barrios (id, ciudad_id, nombre, estrato) VALUES
(4, 1, 'Torobajo', 4), (5, 1, 'Catay', 2), (6, 1, 'Alfonso López', 2)
ON CONFLICT (id) DO NOTHING;

-- 2. Sede Torobajo (lugares 1-6 ya existen)
INSERT INTO campus_universitarios (id, ciudad_id, institucion, nombre_sede, direccion, latitud, longitud, categoria) VALUES
(7, 1, 'Universidad del Cauca', 'Sede Torobajo', 'Calle 15N # 9-50', 2.4820000, -76.5620000, 'UNIVERSIDAD')
ON CONFLICT (id) DO NOTHING;

-- 3. Arrendador sin verificar (hash bcrypt de 'AlojaU123', igual que el seed)
INSERT INTO usuarios (id, nombre_completo, email, password_hash, telefono_whatsapp, rol, telefono_verificado) VALUES
(3, 'Carlos Ríos', 'carlos@alojau.com', '$2b$12$H/aEcbPspp3co4s4f8JxEuJKeEkhwk9hu59NnUjYEDvVjwF8SKS0C', '573002223344', 'ARRENDADOR', FALSE)
ON CONFLICT (id) DO NOTHING;

-- 4. Publicaciones 7-16 (las 1-6 NO se tocan)
INSERT INTO publicaciones (id, usuario_id, zona_barrio_id, titulo, descripcion, tipo_inmueble, canon_mensual, deposito_requerido, reglas_convivencia, direccion_referencial, latitud, longitud, estado, indice_confianza, fecha_expiracion) VALUES
(7, 1, 4, 'Habitación amoblada Torobajo con escritorio', 'Habitación independiente amoblada con escritorio de estudio y baño privado, a 5 min de la sede Torobajo', 'HABITACION_INDEPENDIENTE', 550000, 200000, 'Ambiente de estudio, visitas hasta 8pm', 'Calle 15N # 9-20 Torobajo', 2.4815000, -76.5625000, 'ACTIVO', 100, NOW() + INTERVAL '25 days'),
(8, 1, 4, 'Apartaestudio Torobajo cocina integral', 'Apartaestudio de 30m2 con cocina integral y lavadora, conjunto cerrado con portería', 'APARTAESTUDIO', 780000, 300000, 'Contrato mínimo 6 meses, no mascotas grandes', 'Carrera 9 # 15N-30 Torobajo', 2.4825000, -76.5615000, 'ACTIVO', 100, NOW() + INTERVAL '25 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO publicaciones (id, usuario_id, zona_barrio_id, titulo, descripcion, tipo_inmueble, canon_mensual, deposito_requerido, reglas_convivencia, direccion_referencial, latitud, longitud, estado, indice_confianza, fecha_expiracion) VALUES
(9, (SELECT id FROM usuarios WHERE email = 'carlos@alojau.com'), 5, 'Habitación Catay económica', 'Habitación sencilla en casa familiar del barrio Catay, ideal primer semestre', 'HABITACION_FAMILIAR', 350000, 100000, 'Aseo compartido los sábados', 'Calle 8 # 12-40 Catay', 2.4380000, -76.5980000, 'ACTIVO', 65, NOW() + INTERVAL '25 days'),
(10, (SELECT id FROM usuarios WHERE email = 'carlos@alojau.com'), 2, 'Habitación Pandiguando con closet', 'Habitación con closet empotrado y buena iluminación, cerca paradero', 'HABITACION_INDEPENDIENTE', 420000, 150000, 'No fumar dentro de la casa', 'Carrera 6 # 3-25 Pandiguando', 2.4400000, -76.6045000, 'ACTIVO', 65, NOW() + INTERVAL '25 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO publicaciones (id, usuario_id, zona_barrio_id, titulo, descripcion, tipo_inmueble, canon_mensual, deposito_requerido, reglas_convivencia, direccion_referencial, latitud, longitud, estado, indice_confianza, fecha_renovacion, fecha_expiracion) VALUES
(11, (SELECT id FROM usuarios WHERE email = 'carlos@alojau.com'), 5, 'Habitación Catay ¡precio increíble!', 'Habitación disponible ya mismo en Catay, aprovecha esta oportunidad única e irrepetible', 'HABITACION_INDEPENDIENTE', 90000, 0, 'Sin reglas por ahora, todo se coordina al llegar', 'Catay parte alta', 2.4370000, -76.5970000, 'ACTIVO', 45, NOW(), NOW() + INTERVAL '25 days'),
(12, (SELECT id FROM usuarios WHERE email = 'carlos@alojau.com'), 6, 'Apartaestudio premium Alfonso López', 'Exclusivo apartaestudio de lujo con acabados importados y vista panorámica total', 'APARTAESTUDIO', 8500000, 4000000, 'Se exige codeudor con finca raíz y dos referencias bancarias', 'Calle 20 # 5-10 Alfonso López', 2.4350000, -76.6100000, 'ACTIVO', 40, '2025-06-01 12:00:00+00', '2025-07-01 12:00:00+00'),
(13, (SELECT id FROM usuarios WHERE email = 'carlos@alojau.com'), 1, 'Compartido Centro baratísimo', 'Cupo en apartamento compartido en pleno centro, servicios incluidos supuestamente', 'COMPARTIDO', 120000, 50000, 'Reglas básicas de convivencia y aseo por turnos', 'Centro, cerca al parque', 2.4410000, -76.6060000, 'ACTIVO', 40, '2025-06-01 12:00:00+00', '2025-07-01 12:00:00+00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO publicaciones (id, usuario_id, zona_barrio_id, titulo, descripcion, tipo_inmueble, canon_mensual, deposito_requerido, reglas_convivencia, direccion_referencial, latitud, longitud, estado, indice_confianza, fecha_expiracion) VALUES
(14, 1, 1, 'Habitación Centro con baño', 'Habitación en el centro con baño compartido, suspendida por reportes en revisión', 'HABITACION_INDEPENDIENTE', 400000, 150000, 'Horario de visitas hasta 9pm', 'Carrera 7 # 4-50 Centro', 2.4430000, -76.6080000, 'PAUSADO_POR_REPORTE', 40, NOW() + INTERVAL '25 days'),
(15, (SELECT id FROM usuarios WHERE email = 'carlos@alojau.com'), 5, 'Apartaestudio Catay norte', 'Apartaestudio en Catay con cocina, suspendido por reportes en revisión', 'APARTAESTUDIO', 600000, 200000, 'No fiestas, visitas coordinadas', 'Calle 9 # 11-15 Catay', 2.4390000, -76.5990000, 'PAUSADO_POR_REPORTE', 35, NOW() + INTERVAL '25 days'),
(16, (SELECT id FROM usuarios WHERE email = 'carlos@alojau.com'), 6, 'Habitación Alfonso López', 'Habitación amplia en Alfonso López, suspendida por reportes en revisión', 'HABITACION_FAMILIAR', 370000, 120000, 'Convivencia familiar tranquila', 'Calle 18 # 6-30 Alfonso López', 2.4360000, -76.6110000, 'PAUSADO_POR_REPORTE', 35, NOW() + INTERVAL '25 days')
ON CONFLICT (id) DO NOTHING;

-- 5. Servicios (11 sin servicios a propósito: índice bajo)
INSERT INTO publicacion_servicios (publicacion_id, servicio_id) VALUES
(7,1),(7,2),(7,4), (8,1),(8,4),(8,5),
(9,1),(9,3), (10,1),(10,4),
(12,1), (13,1),(13,4),
(14,1),(14,2), (15,1),(15,4), (16,1),(16,3)
ON CONFLICT DO NOTHING;

-- 6. Distancias a TODOS los lugares (usa haversine_m; el trigger 004 las mantiene al publicar/mover)
INSERT INTO publicacion_campus (publicacion_id, campus_id, distancia_geodesica_m)
SELECT p.id, c.id, haversine_m(p.latitud, p.longitud, c.latitud, c.longitud)
FROM publicaciones p CROSS JOIN campus_universitarios c
WHERE p.id BETWEEN 7 AND 16 AND p.latitud IS NOT NULL AND p.longitud IS NOT NULL
ON CONFLICT DO NOTHING;

-- 7. Fotos Unsplash estables (?auto=format&fit=crop&w=800&q=80)
INSERT INTO imagenes_publicacion (publicacion_id, url, orden) VALUES
(7, 'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80', 1),(7, 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80', 2),(7, 'https://images.unsplash.com/photo-1560185009-5bf9f2849488?auto=format&fit=crop&w=800&q=80', 3),
(8, 'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=800&q=80', 1),(8, 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80', 2),(8, 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=800&q=80', 3),(8, 'https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=800&q=80', 4),
(9, 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80', 1),(9, 'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=800&q=80', 2),
(10, 'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=800&q=80', 1),(10, 'https://images.unsplash.com/photo-1540518614846-7eded433c457?auto=format&fit=crop&w=800&q=80', 2),
(11, 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80', 1),(11, 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80', 2),
(12, 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80', 1),
(13, 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=800&q=80', 1),(13, 'https://images.unsplash.com/photo-1493809842364-78817add58d1?auto=format&fit=crop&w=800&q=80', 2),
(14, 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80', 1),(14, 'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80', 2),(14, 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80', 3),
(15, 'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=800&q=80', 1),(15, 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80', 2),(15, 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=80', 3),
(16, 'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=800&q=80', 1),(16, 'https://images.unsplash.com/photo-1540518614846-7eded433c457?auto=format&fit=crop&w=800&q=80', 2),(16, 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80', 3)
ON CONFLICT DO NOTHING;

-- 8. Reportes (ids 2-13; el 1 PENDIENTE de tu seed original se conserva).
-- Si tu prod ya tiene reportes con esos ids, se omiten sin error.
INSERT INTO reportes_publicacion (id, publicacion_id, motivo, estado) VALUES
(2, 11, 'POSIBLE_ESTAFA', 'CONFIRMADO'), (3, 12, 'DATOS_FALSOS', 'CONFIRMADO'), (4, 13, 'FOTOS_ENGANOSAS', 'CONFIRMADO'),
(5, 14, 'POSIBLE_ESTAFA', 'CONFIRMADO'), (6, 14, 'DATOS_FALSOS', 'CONFIRMADO'), (7, 14, 'OTRO', 'CONFIRMADO'),
(8, 15, 'DATOS_FALSOS', 'CONFIRMADO'), (9, 15, 'FOTOS_ENGANOSAS', 'CONFIRMADO'), (10, 15, 'OTRO', 'CONFIRMADO'),
(11, 16, 'POSIBLE_ESTAFA', 'CONFIRMADO'), (12, 16, 'INMUEBLE_ARRENDADO', 'CONFIRMADO'), (13, 16, 'OTRO', 'CONFIRMADO')
ON CONFLICT (id) DO NOTHING;

-- 9. Auditoría (ids 13-32; tus 12 filas originales se conservan)
INSERT INTO publicaciones_audit (id, publicacion_id, usuario_id, evento) VALUES
(13,7,1,'CREATED'),(14,7,1,'APPROVED'),(15,8,1,'CREATED'),(16,8,1,'APPROVED'),
(17,9,(SELECT id FROM usuarios WHERE email = 'carlos@alojau.com'),'CREATED'),(18,9,(SELECT id FROM usuarios WHERE email = 'carlos@alojau.com'),'APPROVED'),
(19,10,(SELECT id FROM usuarios WHERE email = 'carlos@alojau.com'),'CREATED'),(20,10,(SELECT id FROM usuarios WHERE email = 'carlos@alojau.com'),'APPROVED'),
(21,11,(SELECT id FROM usuarios WHERE email = 'carlos@alojau.com'),'CREATED'),(22,11,(SELECT id FROM usuarios WHERE email = 'carlos@alojau.com'),'APPROVED'),
(23,12,(SELECT id FROM usuarios WHERE email = 'carlos@alojau.com'),'CREATED'),(24,12,(SELECT id FROM usuarios WHERE email = 'carlos@alojau.com'),'APPROVED'),
(25,13,(SELECT id FROM usuarios WHERE email = 'carlos@alojau.com'),'CREATED'),(26,13,(SELECT id FROM usuarios WHERE email = 'carlos@alojau.com'),'APPROVED'),
(27,14,1,'CREATED'),(28,14,2,'PAUSED'),
(29,15,(SELECT id FROM usuarios WHERE email = 'carlos@alojau.com'),'CREATED'),(30,15,2,'PAUSED'),
(31,16,(SELECT id FROM usuarios WHERE email = 'carlos@alojau.com'),'CREATED'),(32,16,2,'PAUSED')
ON CONFLICT (id) DO NOTHING;

-- 10. Secuencias al día (evita choques con futuros inserts de la app)
SELECT setval('publicaciones_id_seq', (SELECT max(id) FROM publicaciones));
SELECT setval('usuarios_id_seq', (SELECT max(id) FROM usuarios));
SELECT setval('zonas_barrios_id_seq', (SELECT max(id) FROM zonas_barrios));
SELECT setval('campus_universitarios_id_seq', (SELECT max(id) FROM campus_universitarios));
SELECT setval('reportes_publicacion_id_seq', (SELECT max(id) FROM reportes_publicacion));
SELECT setval('imagenes_publicacion_id_seq', (SELECT max(id) FROM imagenes_publicacion));
SELECT setval('publicaciones_audit_id_seq', (SELECT max(id) FROM publicaciones_audit));

COMMIT;

-- Verificación (muestra conteos; esperado: 13 ACTIVO + 3 PAUSADO_POR_REPORTE):
-- SELECT estado, count(*) FROM publicaciones GROUP BY estado ORDER BY estado;
-- SELECT count(*) FROM imagenes_publicacion WHERE publicacion_id BETWEEN 7 AND 16;
-- SELECT count(*) FROM publicacion_campus WHERE publicacion_id BETWEEN 7 AND 16;
