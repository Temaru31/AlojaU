-- AlojaU Seed mínimo viable - idempotente - 6 pubs ACTIVO + 4 campus
TRUNCATE publicaciones_audit, reportes_publicacion, imagenes_publicacion, publicacion_campus, publicacion_servicios, publicaciones, servicios_catalogo, campus_universitarios, zonas_barrios, ciudades, usuarios RESTART IDENTITY CASCADE;

-- 1 ciudad
INSERT INTO ciudades (id, nombre, departamento) VALUES (1, 'Popayán', 'Cauca') ON CONFLICT (nombre) DO NOTHING;

-- 3 zonas
INSERT INTO zonas_barrios (id, ciudad_id, nombre, estrato) VALUES
(1, 1, 'Centro', 3), (2, 1, 'Pandiguando', 2), (3, 1, 'Tulcán', 3)
ON CONFLICT DO NOTHING;

-- 2 campus validados (Tulcán 2.443/-76.606, Centro 2.441/-76.606)
INSERT INTO campus_universitarios (id, ciudad_id, institucion, nombre_sede, direccion, latitud, longitud) VALUES
(1, 1, 'Universidad del Cauca', 'Campus Tulcán', 'Calle 5 # 4-70', 2.4430000, -76.6060000),
(2, 1, 'Unicomfacauca', 'Claustro Centro', 'Calle 4 # 8-30', 2.4410000, -76.6060000)
ON CONFLICT DO NOTHING;

-- 5 servicios
INSERT INTO servicios_catalogo (id, nombre, categoria) VALUES
(1, 'WiFi Fibra', 'Básico'), (2, 'Baño Privado', 'Comodidad'), (3, 'Cocina Compartida', 'Básico'), (4, 'Amoblado', 'Comodidad'), (5, 'Lavadora', 'Comodidad')
ON CONFLICT DO NOTHING;

-- 2 usuarios (password: hash bcrypt para AlojaU123)
INSERT INTO usuarios (id, nombre_completo, email, password_hash, telefono_whatsapp, rol, telefono_verificado) VALUES
(1, 'Arrendador Demo', 'arrendador@alojau.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyNiLXCWuP4Ypi', '573001234567', 'ARRENDADOR', TRUE),
(2, 'Admin AlojaU', 'admin@alojau.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyNiLXCWuP4Ypi', '573009999999', 'ADMIN', TRUE)
ON CONFLICT (email) DO NOTHING;

-- 6 publicaciones ACTIVO variadas (lat/lng cerca campus)
INSERT INTO publicaciones (id, usuario_id, zona_barrio_id, titulo, descripcion, tipo_inmueble, canon_mensual, deposito_requerido, reglas_convivencia, direccion_referencial, latitud, longitud, estado, indice_confianza) VALUES
(1, 1, 3, 'Habitación cerca Tulcán - 320m', 'Habitación independiente con baño privado, ideal estudiante foráneo', 'HABITACION_INDEPENDIENTE', 480000, 200000, 'No mascotas, visitas hasta 9pm', 'Calle 5 # 2-10 Tulcán', 2.4440000, -76.6060000, 'ACTIVO', 100),
(2, 1, 1, 'Apartaestudio amoblado Centro', 'Apartaestudio 28m2 amoblado, cocina integral', 'APARTAESTUDIO', 750000, 0, 'Solo estudiantes, no fiestas', 'Carrera 8 # 3-15 Centro', 2.4420000, -76.6070000, 'ACTIVO', 90),
(3, 1, 2, 'Habitación familia Pandiguando', 'Habitación en casa familiar, ambiente tranquilo', 'HABITACION_FAMILIAR', 380000, 150000, 'Horario flexible, aseo semanal', 'Calle 2 # 5-20 Pandiguando', 2.4415000, -76.6055000, 'ACTIVO', 100),
(4, 1, 3, 'Habitación sur Tulcán - disponible', 'Habitación amplia con closet, cerca Unicauca', 'HABITACION_INDEPENDIENTE', 520000, 250000, 'No fumar, mascotas pequeñas sí', 'Calle 6 # 1-30 Tulcán sur', 2.4380000, -76.6100000, 'ACTIVO', 85),
(5, 1, 3, 'Compartido Tulcán norte', 'Apartamento compartido 2 hab, sala amplia', 'COMPARTIDO', 650000, 300000, 'Compartir aseo, visitas coordinadas', 'Carrera 2 # 4-10 Tulcán norte', 2.4455000, -76.6030000, 'ACTIVO', 100),
(6, 1, 2, 'Apartaestudio Pandiguando', 'Apartaestudio nuevo, lavadora incluida', 'APARTAESTUDIO', 620000, 200000, 'Contrato mínimo 6 meses', 'Calle 1 # 6-15 Pandiguando', 2.4360000, -76.6065000, 'ACTIVO', 100)
ON CONFLICT (id) DO NOTHING;
SELECT setval('publicaciones_id_seq', 6, true);

-- Servicios por publicación
INSERT INTO publicacion_servicios (publicacion_id, servicio_id) VALUES
(1,1),(1,2),(1,4), (2,1),(2,4),(2,5), (3,1),(3,3), (4,1),(4,2), (5,1),(5,3),(5,5), (6,1),(6,5)
ON CONFLICT DO NOTHING;

-- Distancias Haversine precalculadas (usa función)
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

-- 20 imágenes reales (Unsplash + placehold) - siempre cargan, sin 404 (picsum a veces 522)
INSERT INTO imagenes_publicacion (publicacion_id, url, orden) VALUES
-- Pub1 Tulcán: 4 fotos variadas (habitación, baño, cocina, fachada)
(1, 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&h=400&fit=crop', 1),(1, 'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=600&h=400&fit=crop', 2),(1, 'https://images.unsplash.com/photo-1493809842364-78817add58d1?w=600&h=400&fit=crop', 3),(1, 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&h=400&fit=crop', 4),
-- Pub2 Centro: apartaestudio
(2, 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&h=400&fit=crop', 1),(2, 'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=600&h=400&fit=crop', 2),(2, 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&h=400&fit=crop', 3),
-- Pub3 Pandiguando: familiar
(3, 'https://images.unsplash.com/photo-1493809842364-78817add58d1?w=600&h=400&fit=crop', 1),(3, 'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=600&h=400&fit=crop', 2),(3, 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&h=400&fit=crop', 3),
-- Pub4 Tulcán sur
(4, 'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=600&h=400&fit=crop', 1),(4, 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&h=400&fit=crop', 2),(4, 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&h=400&fit=crop', 3),(4, 'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=600&h=400&fit=crop', 4),
-- Pub5 Compartido
(5, 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&h=400&fit=crop', 1),(5, 'https://images.unsplash.com/photo-1493809842364-78817add58d1?w=600&h=400&fit=crop', 2),(5, 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&h=400&fit=crop', 3),
-- Pub6 Pandiguando moderno
(6, 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&h=400&fit=crop', 1),(6, 'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=600&h=400&fit=crop', 2),(6, 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&h=400&fit=crop', 3)
ON CONFLICT DO NOTHING;

-- 1 reporte PENDIENTE para probar índice (pub 2 pierde 10pts -> 90 en vez de 100)
INSERT INTO reportes_publicacion (publicacion_id, motivo, estado) VALUES (2, 'DATOS_FALSOS', 'PENDIENTE') ON CONFLICT DO NOTHING;

-- Auditoría
INSERT INTO publicaciones_audit (publicacion_id, usuario_id, evento) VALUES
(1,1,'CREATED'),(1,1,'APPROVED'),(2,1,'CREATED'),(2,1,'APPROVED'),(3,1,'CREATED'),(3,1,'APPROVED'),
(4,1,'CREATED'),(4,1,'APPROVED'),(5,1,'CREATED'),(5,1,'APPROVED'),(6,1,'CREATED'),(6,1,'APPROVED')
ON CONFLICT DO NOTHING;
