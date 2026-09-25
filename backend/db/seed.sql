-- AlojaU Seed v7 - idempotente - 16 pubs (13 ACTIVO + 3 PAUSADO_POR_REPORTE) + 7 lugares
-- Escenarios: 5 alta (90-100) + 4 media (50-79) + 3 baja (<50) + 3 pausados por reportes.
-- Fotos Unsplash estables con coherencia semántica (?auto=format&fit=crop&w=800&q=80):
--   Habitación -> dormitorio/escritorio · Apartaestudio -> ambiente integrado/cocina ·
--   Compartido -> sala/áreas comunes.
TRUNCATE publicaciones_audit, reportes_publicacion, imagenes_publicacion, publicacion_campus, publicacion_servicios, publicaciones, housing_types, servicios_catalogo, campus_universitarios, zonas_barrios, ciudades, usuarios, sesiones, password_resets, otp_codes, rate_limit_attempts, vistas_dedup, system_settings RESTART IDENTITY CASCADE;

-- M2 tipos dinámicos (mig 013): catálogo base, nunca renombrar/eliminar slugs.
INSERT INTO housing_types (slug, nombre_visible, descripcion_tooltip, icono, esta_activo) VALUES
('HABITACION_FAMILIAR', 'Habitación familiar', 'Habitación en casa de familia, ambiente compartido', '🏠', TRUE),
('HABITACION_INDEPENDIENTE', 'Habitación independiente', 'Habitación privada con acceso independiente', '🚪', TRUE),
('APARTAESTUDIO', 'Apartaestudio', 'Ambiente integrado con cocina y baño privados', '🏢', TRUE),
('COMPARTIDO', 'Compartido', 'Cupo en vivienda compartida con otros estudiantes', '🤝', TRUE),
('APARTAMENTO_COMPLETO', 'Apartamento completo', 'Apartamento entero para ti o tu grupo', '🏘️', TRUE),
('HABITACION_PISO_COMPARTIDO', 'Habitación en piso compartido', 'Habitación privada en piso con zonas comunes', '🏡', TRUE)
ON CONFLICT (slug) DO NOTHING;

-- v15.2: settings canónicos (espejo de migración 005). Sin esto, filas de
-- otros entornos/tests contaminan la tabla entre reseeds.
INSERT INTO system_settings (clave, valor, tipo, descripcion) VALUES
('dias_vigencia_publicacion', '30', 'int', 'Días de vigencia al publicar/renovar'),
('max_reportes_para_pausa_automatica', '3', 'int', 'Reportes que pausan el aviso'),
('auto_aprobar_arrendadores_verificados', 'false', 'bool', 'Auto-aprobar verificados')
ON CONFLICT (clave) DO NOTHING;

-- 1 ciudad
INSERT INTO ciudades (id, nombre, departamento) VALUES (1, 'Popayán', 'Cauca') ON CONFLICT (nombre) DO NOTHING;

-- 6 zonas
INSERT INTO zonas_barrios (id, ciudad_id, nombre, estrato) VALUES
(1, 1, 'Centro', 3), (2, 1, 'Pandiguando', 2), (3, 1, 'Tulcán', 3),
(4, 1, 'Torobajo', 4), (5, 1, 'Catay', 2), (6, 1, 'Alfonso López', 2)
ON CONFLICT DO NOTHING;

-- 7 lugares: 2 campus validados + 4 POIs 004 + sede Torobajo (Unicauca norte)
INSERT INTO campus_universitarios (id, ciudad_id, institucion, nombre_sede, direccion, latitud, longitud, categoria) VALUES
(1, 1, 'Universidad del Cauca', 'Campus Tulcán', 'Calle 5 # 4-70', 2.4430000, -76.6060000, 'UNIVERSIDAD'),
(2, 1, 'Unicomfacauca', 'Claustro Centro', 'Calle 4 # 8-30', 2.4410000, -76.6060000, 'UNIVERSIDAD'),
(3, 1, 'Centro Comercial Campanario', 'Sede Única', 'Carrera 9 # 24N-43', 2.4467000, -76.6014000, 'CENTRO_COMERCIAL'),
(4, 1, 'Hospital Universitario San José', 'Sede Principal', 'Carrera 6 # 10N-142', 2.4510000, -76.5990000, 'SALUD'),
(5, 1, 'Terminal de Transportes', 'Sede Única', 'Transversal 9 # 4N-125', 2.4505000, -76.6130000, 'TRANSPORTE'),
(6, 1, 'Parque Caldas', 'Centro Histórico', 'Parque Caldas Centro', 2.4418000, -76.6064000, 'OTRO'),
(7, 1, 'Universidad del Cauca', 'Sede Torobajo', 'Calle 15N # 9-50', 2.4820000, -76.5620000, 'UNIVERSIDAD')
ON CONFLICT DO NOTHING;

-- 5 servicios
INSERT INTO servicios_catalogo (id, nombre, categoria) VALUES
(1, 'WiFi Fibra', 'Básico'), (2, 'Baño Privado', 'Comodidad'), (3, 'Cocina Compartida', 'Básico'), (4, 'Amoblado', 'Comodidad'), (5, 'Lavadora', 'Comodidad')
ON CONFLICT DO NOTHING;

-- 3 usuarios (hashes bcrypt de 'AlojaU123'; ver backend/scripts/seed_db.py para regenerar)
INSERT INTO usuarios (id, nombre_completo, email, password_hash, telefono_whatsapp, rol, telefono_verificado) VALUES
(1, 'Arrendador Demo', 'arrendador@alojau.com', '$2b$12$H/aEcbPspp3co4s4f8JxEuJKeEkhwk9hu59NnUjYEDvVjwF8SKS0C', '573001234567', 'ARRENDADOR', TRUE),
(2, 'Admin AlojaU', 'admin@alojau.com', '$2b$12$WvQKa.isUDxXvQi59Hito.uVYTz/MLs1Wdq.fmitUVMg3ybodFX/6', '573009999999', 'ADMIN', TRUE),
(3, 'Carlos Ríos', 'carlos@alojau.com', '$2b$12$H/aEcbPspp3co4s4f8JxEuJKeEkhwk9hu59NnUjYEDvVjwF8SKS0C', '573002223344', 'ARRENDADOR', FALSE)
ON CONFLICT (email) DO NOTHING;

-- Pubs 1-6: históricos ACTIVO (intactos para paridad de tests)
INSERT INTO publicaciones (id, usuario_id, zona_barrio_id, titulo, descripcion, tipo_inmueble, canon_mensual, deposito_requerido, reglas_convivencia, direccion_referencial, latitud, longitud, estado, indice_confianza) VALUES
(1, 1, 3, 'Habitación cerca Tulcán - 320m', 'Habitación independiente con baño privado, ideal estudiante foráneo', 'HABITACION_INDEPENDIENTE', 480000, 200000, 'No mascotas, visitas hasta 9pm', 'Calle 5 # 2-10 Tulcán', 2.4440000, -76.6060000, 'ACTIVO', 100),
(2, 1, 1, 'Apartaestudio amoblado Centro', 'Apartaestudio 28m2 amoblado, cocina integral', 'APARTAESTUDIO', 750000, 0, 'Solo estudiantes, no fiestas', 'Carrera 8 # 3-15 Centro', 2.4420000, -76.6070000, 'ACTIVO', 90),
(3, 1, 2, 'Habitación familia Pandiguando', 'Habitación en casa familiar, ambiente tranquilo', 'HABITACION_FAMILIAR', 380000, 150000, 'Horario flexible, aseo semanal', 'Calle 2 # 5-20 Pandiguando', 2.4415000, -76.6055000, 'ACTIVO', 100),
(4, 1, 3, 'Habitación sur Tulcán - disponible', 'Habitación amplia con closet, cerca Unicauca', 'HABITACION_INDEPENDIENTE', 520000, 250000, 'No fumar, mascotas pequeñas sí', 'Calle 6 # 1-30 Tulcán sur', 2.4380000, -76.6100000, 'ACTIVO', 85),
(5, 1, 3, 'Compartido Tulcán norte', 'Apartamento compartido 2 hab, sala amplia', 'COMPARTIDO', 650000, 300000, 'Compartir aseo, visitas coordinadas', 'Carrera 2 # 4-10 Tulcán norte', 2.4455000, -76.6030000, 'ACTIVO', 100),
(6, 1, 2, 'Apartaestudio Pandiguando', 'Apartaestudio nuevo, lavadora incluida', 'APARTAESTUDIO', 620000, 200000, 'Contrato mínimo 6 meses', 'Calle 1 # 6-15 Pandiguando', 2.4360000, -76.6065000, 'ACTIVO', 100)
ON CONFLICT (id) DO NOTHING;

-- Alta confianza 90-100 (7-8): verificados en Torobajo, completos, 3-4 fotos
INSERT INTO publicaciones (id, usuario_id, zona_barrio_id, titulo, descripcion, tipo_inmueble, canon_mensual, deposito_requerido, reglas_convivencia, direccion_referencial, latitud, longitud, estado, indice_confianza, fecha_expiracion) VALUES
(7, 1, 4, 'Habitación amoblada Torobajo con escritorio', 'Habitación independiente amoblada con escritorio de estudio y baño privado, a 5 min de la sede Torobajo', 'HABITACION_INDEPENDIENTE', 550000, 200000, 'Ambiente de estudio, visitas hasta 8pm', 'Calle 15N # 9-20 Torobajo', 2.4815000, -76.5625000, 'ACTIVO', 100, NOW() + INTERVAL '25 days'),
(8, 1, 4, 'Apartaestudio Torobajo cocina integral', 'Apartaestudio de 30m2 con cocina integral y lavadora, conjunto cerrado con portería', 'APARTAESTUDIO', 780000, 300000, 'Contrato mínimo 6 meses, no mascotas grandes', 'Carrera 9 # 15N-30 Torobajo', 2.4825000, -76.5615000, 'ACTIVO', 100, NOW() + INTERVAL '25 days')
ON CONFLICT (id) DO NOTHING;

-- Confianza media 50-79 (9-12): dueño sin verificar + solo 2 fotos (65 = 40+0+0+15+10)
INSERT INTO publicaciones (id, usuario_id, zona_barrio_id, titulo, descripcion, tipo_inmueble, canon_mensual, deposito_requerido, reglas_convivencia, direccion_referencial, latitud, longitud, estado, indice_confianza, fecha_expiracion) VALUES
(9, 3, 5, 'Habitación Catay económica', 'Habitación sencilla en casa familiar del barrio Catay, ideal primer semestre', 'HABITACION_FAMILIAR', 350000, 100000, 'Aseo compartido los sábados', 'Calle 8 # 12-40 Catay', 2.4380000, -76.5980000, 'ACTIVO', 65, NOW() + INTERVAL '25 days'),
(10, 3, 2, 'Habitación Pandiguando con closet', 'Habitación con closet empotrado y buena iluminación, cerca paradero', 'HABITACION_INDEPENDIENTE', 420000, 150000, 'No fumar dentro de la casa', 'Carrera 6 # 3-25 Pandiguando', 2.4400000, -76.6045000, 'ACTIVO', 65, NOW() + INTERVAL '25 days')
ON CONFLICT (id) DO NOTHING;

-- Confianza baja / sospechosos <50 (11-13): precios anómalos, sin servicios o vigencia vieja + reportes
INSERT INTO publicaciones (id, usuario_id, zona_barrio_id, titulo, descripcion, tipo_inmueble, canon_mensual, deposito_requerido, reglas_convivencia, direccion_referencial, latitud, longitud, estado, indice_confianza, fecha_renovacion, fecha_expiracion) VALUES
(11, 3, 5, 'Habitación Catay ¡precio increíble!', 'Habitación disponible ya mismo en Catay, aprovecha esta oportunidad única e irrepetible', 'HABITACION_INDEPENDIENTE', 90000, 0, 'Sin reglas por ahora, todo se coordina al llegar', 'Catay parte alta', 2.4370000, -76.5970000, 'ACTIVO', 45, NOW(), NOW() + INTERVAL '25 days'),
(12, 3, 6, 'Apartaestudio premium Alfonso López', 'Exclusivo apartaestudio de lujo con acabados importados y vista panorámica total', 'APARTAESTUDIO', 8500000, 4000000, 'Se exige codeudor con finca raíz y dos referencias bancarias', 'Calle 20 # 5-10 Alfonso López', 2.4350000, -76.6100000, 'ACTIVO', 40, '2025-06-01 12:00:00+00', '2025-07-01 12:00:00+00'),
(13, 3, 1, 'Compartido Centro baratísimo', 'Cupo en apartamento compartido en pleno centro, servicios incluidos supuestamente', 'COMPARTIDO', 120000, 50000, 'Reglas básicas de convivencia y aseo por turnos', 'Centro, cerca al parque', 2.4410000, -76.6060000, 'ACTIVO', 40, '2025-06-01 12:00:00+00', '2025-07-01 12:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- Pausados por reportes (14-16): Centro, Catay, Alfonso López
INSERT INTO publicaciones (id, usuario_id, zona_barrio_id, titulo, descripcion, tipo_inmueble, canon_mensual, deposito_requerido, reglas_convivencia, direccion_referencial, latitud, longitud, estado, indice_confianza, fecha_expiracion) VALUES
(14, 1, 1, 'Habitación Centro con baño', 'Habitación en el centro con baño compartido, suspendida por reportes en revisión', 'HABITACION_INDEPENDIENTE', 400000, 150000, 'Horario de visitas hasta 9pm', 'Carrera 7 # 4-50 Centro', 2.4430000, -76.6080000, 'PAUSADO_POR_REPORTE', 40, NOW() + INTERVAL '25 days'),
(15, 3, 5, 'Apartaestudio Catay norte', 'Apartaestudio en Catay con cocina, suspendido por reportes en revisión', 'APARTAESTUDIO', 600000, 200000, 'No fiestas, visitas coordinadas', 'Calle 9 # 11-15 Catay', 2.4390000, -76.5990000, 'PAUSADO_POR_REPORTE', 35, NOW() + INTERVAL '25 days'),
(16, 3, 6, 'Habitación Alfonso López', 'Habitación amplia en Alfonso López, suspendida por reportes en revisión', 'HABITACION_FAMILIAR', 370000, 120000, 'Convivencia familiar tranquila', 'Calle 18 # 6-30 Alfonso López', 2.4360000, -76.6110000, 'PAUSADO_POR_REPORTE', 35, NOW() + INTERVAL '25 days')
ON CONFLICT (id) DO NOTHING;
-- v14.1: secuencias al max(id) en TODAS las tablas con ids explícitos
-- (antes solo publicaciones/usuarios: cualquier INSERT sin id colisionaba).
SELECT setval('publicaciones_id_seq', (SELECT max(id) FROM publicaciones), true);
SELECT setval('usuarios_id_seq', (SELECT max(id) FROM usuarios), true);
SELECT setval('ciudades_id_seq', (SELECT max(id) FROM ciudades), true);
SELECT setval('zonas_barrios_id_seq', (SELECT max(id) FROM zonas_barrios), true);
SELECT setval('campus_universitarios_id_seq', (SELECT max(id) FROM campus_universitarios), true);
SELECT setval('servicios_catalogo_id_seq', (SELECT max(id) FROM servicios_catalogo), true);

-- Servicios por publicación (11 sin servicios a propósito: completitud 30 -> índice bajo)
INSERT INTO publicacion_servicios (publicacion_id, servicio_id) VALUES
(1,1),(1,2),(1,4), (2,1),(2,4),(2,5), (3,1),(3,3), (4,1),(4,2), (5,1),(5,3),(5,5), (6,1),(6,5),
(7,1),(7,2),(7,4), (8,1),(8,4),(8,5),
(9,1),(9,3), (10,1),(10,4),
(12,1), (13,1),(13,4),
(14,1),(14,2), (15,1),(15,4), (16,1),(16,3)
ON CONFLICT DO NOTHING;

-- Distancias Haversine precalculadas pubs 1-6 x campus 1-2 (histórico intacto)
INSERT INTO publicacion_campus (publicacion_id, campus_id, distancia_geodesica_m) VALUES
(1, 1, haversine_m(2.4440000, -76.6060000, 2.4430000, -76.6060000)),
(1, 2, haversine_m(2.4440000, -76.6060000, 2.4410000, -76.6060000)),
(2, 1, haversine_m(2.4420000, -76.6070000, 2.4430000, -76.6060000)),
(2, 2, haversine_m(2.4420000, -76.6070000, 2.4410000, -76.6060000)),
(3, 1, haversine_m(2.4415000, -76.6055000, 2.4430000, -76.6060000)),
(3, 2, haversine_m(2.4415000, -76.6055000, 2.4410000, -76.6060000)),
(4, 1, haversine_m(2.4380000, -76.6100000, 2.4430000, -76.6060000)),
(4, 2, haversine_m(2.4380000, -76.6100000, 2.4410000, -76.6060000)),
(5, 1, haversine_m(2.4455000, -76.6030000, 2.4430000, -76.6060000)),
(5, 2, haversine_m(2.4455000, -76.6030000, 2.4410000, -76.6060000)),
(6, 1, haversine_m(2.4360000, -76.6065000, 2.4430000, -76.6060000)),
(6, 2, haversine_m(2.4360000, -76.6065000, 2.4410000, -76.6060000))
ON CONFLICT DO NOTHING;

-- 004 POIs + Torobajo: TODAS las pubs x TODOS los lugares (determinista, convive con el trigger)
INSERT INTO publicacion_campus (publicacion_id, campus_id, distancia_geodesica_m)
SELECT p.id, c.id, haversine_m(p.latitud, p.longitud, c.latitud, c.longitud)
FROM publicaciones p CROSS JOIN campus_universitarios c
WHERE p.latitud IS NOT NULL AND p.longitud IS NOT NULL
ON CONFLICT DO NOTHING;

-- Imágenes Unsplash estables (?auto=format&fit=crop&w=800&q=80) con coherencia semántica
INSERT INTO imagenes_publicacion (publicacion_id, url, orden) VALUES
-- Pub1 habitación Tulcán: dormitorios
(1, 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80', 1),(1, 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80', 2),(1, 'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80', 3),(1, 'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=800&q=80', 4),
-- Pub2 apartaestudio Centro: ambiente integrado + cocina
(2, 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80', 1),(2, 'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=800&q=80', 2),(2, 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80', 3),
-- Pub3 habitación familiar: dormitorios
(3, 'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=800&q=80', 1),(3, 'https://images.unsplash.com/photo-1540518614846-7eded433c457?auto=format&fit=crop&w=800&q=80', 2),(3, 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80', 3),
-- Pub4 habitación Tulcán sur: dormitorios
(4, 'https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=800&q=80', 1),(4, 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?auto=format&fit=crop&w=800&q=80', 2),(4, 'https://images.unsplash.com/photo-1615874959474-d609969a20ed9?auto=format&fit=crop&w=800&q=80', 3),(4, 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=800&q=80', 4),
-- Pub5 compartido: sala + áreas comunes
(5, 'https://images.unsplash.com/photo-1493809842364-78817add58d1?auto=format&fit=crop&w=800&q=80', 1),(5, 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=800&q=80', 2),(5, 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80', 3),
-- Pub6 apartaestudio Pandiguando: integrado + cocina
(6, 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80', 1),(6, 'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=800&q=80', 2),(6, 'https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=800&q=80', 3),
-- Pub7 habitación Torobajo: dormitorio + escritorio
(7, 'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80', 1),(7, 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80', 2),(7, 'https://images.unsplash.com/photo-1560185009-5bf9f2849488?auto=format&fit=crop&w=800&q=80', 3),
-- Pub8 apartaestudio Torobajo: cocina + integrado
(8, 'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=800&q=80', 1),(8, 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80', 2),(8, 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=800&q=80', 3),(8, 'https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=800&q=80', 4),
-- Pub9-10 media: dormitorios sencillos
(9, 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80', 1),(9, 'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=800&q=80', 2),
(10, 'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=800&q=80', 1),(10, 'https://images.unsplash.com/photo-1540518614846-7eded433c457?auto=format&fit=crop&w=800&q=80', 2),
-- Pub11-13 baja: dormitorios/interiores genéricos
(11, 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80', 1),(11, 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80', 2),
(12, 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80', 1),
(13, 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=800&q=80', 1),(13, 'https://images.unsplash.com/photo-1493809842364-78817add58d1?auto=format&fit=crop&w=800&q=80', 2),
-- Pub14-16 pausados: dormitorios/interiores
(14, 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80', 1),(14, 'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80', 2),(14, 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80', 3),
(15, 'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=800&q=80', 1),(15, 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80', 2),(15, 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=80', 3),
(16, 'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=800&q=80', 1),(16, 'https://images.unsplash.com/photo-1540518614846-7eded433c457?auto=format&fit=crop&w=800&q=80', 2),(16, 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80', 3)
ON CONFLICT DO NOTHING;

-- 1er reporte = id 1 PENDIENTE en pub 2 (paridad con tests: pub 2 pierde 10pts)
INSERT INTO reportes_publicacion (publicacion_id, motivo, estado) VALUES (2, 'DATOS_FALSOS', 'PENDIENTE') ON CONFLICT DO NOTHING;
-- Reportes CONFIRMADO en sospechosos (bajan su índice a zona de riesgo)
INSERT INTO reportes_publicacion (publicacion_id, motivo, estado) VALUES
(11, 'POSIBLE_ESTAFA', 'CONFIRMADO'), (12, 'DATOS_FALSOS', 'CONFIRMADO'), (13, 'FOTOS_ENGANOSAS', 'CONFIRMADO')
ON CONFLICT DO NOTHING;
-- Pausa automática justificada: 3 CONFIRMADO en cada pausado (umbral default 3)
INSERT INTO reportes_publicacion (publicacion_id, motivo, estado) VALUES
(14, 'POSIBLE_ESTAFA', 'CONFIRMADO'), (14, 'DATOS_FALSOS', 'CONFIRMADO'), (14, 'OTRO', 'CONFIRMADO'),
(15, 'DATOS_FALSOS', 'CONFIRMADO'), (15, 'FOTOS_ENGANOSAS', 'CONFIRMADO'), (15, 'OTRO', 'CONFIRMADO'),
(16, 'POSIBLE_ESTAFA', 'CONFIRMADO'), (16, 'INMUEBLE_ARRENDADO', 'CONFIRMADO'), (16, 'OTRO', 'CONFIRMADO')
ON CONFLICT DO NOTHING;

-- Auditoría (CREATED/APPROVED en visibles, CREATED/PAUSED en pausados)
INSERT INTO publicaciones_audit (publicacion_id, usuario_id, evento) VALUES
(1,1,'CREATED'),(1,1,'APPROVED'),(2,1,'CREATED'),(2,1,'APPROVED'),(3,1,'CREATED'),(3,1,'APPROVED'),
(4,1,'CREATED'),(4,1,'APPROVED'),(5,1,'CREATED'),(5,1,'APPROVED'),(6,1,'CREATED'),(6,1,'APPROVED'),
(7,1,'CREATED'),(7,1,'APPROVED'),(8,1,'CREATED'),(8,1,'APPROVED'),
(9,3,'CREATED'),(9,3,'APPROVED'),(10,3,'CREATED'),(10,3,'APPROVED'),
(11,3,'CREATED'),(11,3,'APPROVED'),(12,3,'CREATED'),(12,3,'APPROVED'),(13,3,'CREATED'),(13,3,'APPROVED'),
(14,1,'CREATED'),(14,2,'PAUSED'),(15,3,'CREATED'),(15,2,'PAUSED'),(16,3,'CREATED'),(16,2,'PAUSED')
ON CONFLICT DO NOTHING;
