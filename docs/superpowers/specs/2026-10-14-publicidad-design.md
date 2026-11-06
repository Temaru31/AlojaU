# Diseño — Módulo Publicidad AlojaU (2026-10-14)

## 1. Objetivo
Monetizar sin romper UX: arrendador destaca su aviso en búsqueda por días.
Fase 2 reserva slots para Google AdSense sin reescribir.

## 2. Alcance v1 (enfoque A)
- Planes 7/15/30 días con prioridad 1/2/3.
- Solo publicaciones ACTIVO del dueño.
- Pago manual v1: comprobante + aprobación admin. Sin pasarela.
- Orden búsqueda: destacados vigentes primero (prioridad, luego recientes).
- Badge "Destacado" en Card y Detalle.

Fuera v1: banners externos, AdSense, pagos online, impresiones/clics.

## 3. Modelo BD (mig 022)
- `planes_publicidad(id SERIAL PK, nombre TEXT UNIQUE, dias INT, precio_cop INT, prioridad INT, activo BOOL DEFAULT true)`
- `publicacion_destacados(id SERIAL PK, publicacion_id INT FK publicaciones.id CASCADE, plan_id INT FK planes_publicidad.id RESTRICT, inicia TIMESTAMPTZ DEFAULT now(), vence TIMESTAMPTZ NOT NULL, estado TEXT DEFAULT 'PENDIENTE' CHECK (PENDIENTE/ACTIVO/VENCIDO/RECHAZADO), pago_ref TEXT, created_by INT FK usuarios.id, created_at TIMESTAMPTZ DEFAULT now())`
- Índices: `(publicacion_id, estado)`, `(estado, vence)`, unique parcial un ACTIVO por publicación.
- Seed planes: 7d/15000/p1, 15d/25000/p2, 30d/40000/p3.

## 4. API backend
- `GET /api/publicidad/planes` público.
- `POST /api/publicidad/destacar` (ARRENDADOR, dueño, Idempotency-Key): crea PENDIENTE, valida ACTIVO + sin destacado vigente.
- `GET /api/publicidad/mias` (dueño): historial y estado.
- `GET /api/admin/publicidad/pendientes` + `PATCH /api/admin/publicidad/{id}` (aprobar/rechazar, audit) — reutiliza `publicaciones_audit` con evento PROMOTED/DEMOTED o tabla propia si prefieren.
- `GET /api/publicaciones` incluye `destacado: true, vence` y ordena destacados primero. `GET /api/publicaciones/{id}` igual.
- Job diario `vencer_destacados()` (cron o endpoint admin): PENDIENTE vencido→VENCIDO, sin borrar historial.

## 5. Frontend
- `Card.jsx`: badge Destacado + borde sutil, sin emojis.
- `Detalle.jsx`: banner info vigencia.
- Nueva `pages/Publicitar.jsx` (protegida arrendador): elige plan, sube pago_ref, ve estado. Link desde `MisPublicaciones`.
- `AdminDashboard`: pestaña publicidad con pendientes y aprobar/rechazar.
- Slots reservados: `<AdSlot id="home-top"/>` renderiza null en v1, listo para AdSense.

## 6. Seguridad y reglas
- RBAC existente: solo dueño y admin tocan destacados.
- Throttle crear 10/h como publicar; valida MIME si hay comprobante imagen.
- Sin PII en logs; precio solo informativo v1.

## 7. Testing
- Backend: crear válido/inválido (no dueño, no ACTIVO, duplicado vigente), aprobar/rechazar admin, vencimiento job, orden búsqueda con destacados.
- Frontend: badge, flujo publicitar, admin aprueba. Cobertura gate 70%.

## 8. Roadmap
- v2: pasarela (PSE/Tarjeta), facturación.
- v3: AdSense en slots reservados + `ads.txt` + consentimiento cookies.
