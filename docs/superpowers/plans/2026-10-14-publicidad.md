# Publicidad Destacados v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arrendador destaca su aviso ACTIVO por 7/15/30 días con aprobación admin y badge en UI.

**Architecture:** Migración 022 + router `publicidad.py` con RBAC existente; `GET /api/publicaciones` ordena destacados vigentes primero; frontend badge + página Publicitar + tab admin; job diario vence.

**Tech Stack:** FastAPI + SQLAlchemy 2 async + asyncpg, React 19 + Axios, pytest + Vitest.

**Spec:** `docs/superpowers/specs/2026-10-14-publicidad-design.md`

## Global Constraints

- Solo publicaciones en estado ACTIVO pueden destacarse.
- Un solo destacado ACTIVO/PENDIENTE vigente por publicación (unique parcial).
- Pago v1 manual con `pago_ref` texto, sin pasarela.
- Sin emojis en UI, usar `lucide-react` o `TipoIcono`.
- Migraciones idempotentes, tests restauran lo que leen.
- Gate coverage backend 70%.

## Review Focus

- Destacar publicación PAUSADA/RECHAZADA debe fallar 409, no crear PENDIENTE silencioso.
- Duplicado vigente del mismo aviso debe fallar 409 aunque cambie de plan.
- Vencido a las 00:00 debe dejar de ordenar primero sin borrar historial.
- `GET /api/publicaciones` sin destacados no cambia orden actual.
- Admin que aprueba aviso ya vencido debe rechazar con 409, no activar.

---

### Task 1: Migración 022 + modelos + seed planes

**Files:**
- Create: `backend/db/migrations/022_publicidad_destacados.sql`
- Create: `backend/alembic/versions/022_publicidad_destacados.py` (espejo, seguir formato de `021_*`)
- Modify: `backend/app/models/__init__.py` (agregar `PlanPublicidad`, `PublicacionDestacado`)
- Modify: `backend/db/schema.sql` (agregar DDL espejo al final, antes de grants chatbot)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `PlanPublicidad(id, nombre, dias, precio_cop, prioridad, activo)`, `PublicacionDestacado(id, publicacion_id, plan_id, inicia, vence, estado, pago_ref, created_by)`; estados `PENDIENTE/ACTIVO/VENCIDO/RECHAZADO`.

- [ ] **Step 1: Escribir SQL 022** con CREATE TABLE IF NOT EXISTS + índices + unique parcial + seed 3 planes (7d/15000/p1, 15d/25000/p2, 30d/40000/p3) idempotente con ON CONFLICT DO NOTHING.
- [ ] **Step 2: Aplicar en dev** `psql $DATABASE_URL -f backend/db/migrations/022_publicidad_destacados.sql` y verificar `\d publicacion_destacados`.
- [ ] **Step 3: Agregar modelos SQLAlchemy** en `models/__init__.py` siguiendo patrón de `Reporte`/`Notificacion`.
- [ ] **Step 4: Espejo Alembic 022** copiando estructura de `021_*`.
- [ ] **Step 5: Commit** `git add backend/db/migrations/022* backend/alembic/versions/022* backend/app/models/__init__.py backend/db/schema.sql && git commit -m "feat(publicidad): mig 022 modelos y planes seed"`

### Task 2: Router publicidad + registro

**Files:**
- Create: `backend/app/routers/publicidad.py`
- Create: `backend/app/schemas/publicidad.py` (o ampliar `schemas/` existente si hay patrón; revisar antes)
- Modify: `backend/app/main.py:255-268` (agregar `include_router(publicidad.router)`)

**Interfaces:**
- Consumes: `require_arrendador`, `require_admin` de `app/core/permissions.py`; modelos Task 1.
- Produces: `GET /api/publicidad/planes`, `POST /api/publicidad/destacar`, `GET /api/publicidad/mias`, `GET /api/admin/publicidad/pendientes`, `PATCH /api/admin/publicidad/{id}`.

- [ ] **Step 1: Test failing** `backend/tests/test_publicidad_api.py::test_destacar_crea_pendiente` — POST con publicación ACTIVO propia + plan 7d + `Idempotency-Key` → 201 PENDIENTE.
- [ ] **Step 2: Correr y ver FAIL** `venv/bin/python -m pytest backend/tests/test_publicidad_api.py::test_destacar_crea_pendiente -v` (router no existe).
- [ ] **Step 3: Implementar router** con validaciones: dueño, ACTIVO, sin vigente (409), calcula `vence = now + plan.dias`; admin aprueba → ACTIVO + audit, rechaza → RECHAZADO.
- [ ] **Step 4: Registrar en `main.py`** y correr test → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(publicidad): router planes/destacar/admin"`

### Task 3: Orden y flag en búsqueda

**Files:**
- Modify: `backend/app/routers/publicaciones.py` (lista `GET /` y `GET /{id}`, cerca de `order_by` línea ~435 y ~1238)

**Interfaces:**
- Consumes: `PublicacionDestacado` vigente (`estado='ACTIVO' AND vence > now()`).
- Produces: items con `destacado: bool`, `destacado_vence: datetime|None`; lista ordena vigentes primero por prioridad desc.

- [ ] **Step 1: Test failing** `test_busqueda_ordena_destacados_primero` — 2 pubs, una destacada ACTIVO → primera es la destacada con `destacado=true`.
- [ ] **Step 2: Correr y ver FAIL.**
- [ ] **Step 3: Implementar LEFT JOIN** a destacados vigentes + `order_by(destacado desc, prioridad desc, ...actual)`.
- [ ] **Step 4: PASS + sin regresión** `pytest backend/tests/test_busqueda_q.py -q`.
- [ ] **Step 5: Commit** `git commit -m "feat(publicidad): destacados primero en busqueda"`

### Task 4: Job vencimiento

**Files:**
- Create: `backend/app/services/publicidad.py` con `vencer_destacados(session) -> int`
- Modify: router admin o `admin_automation.py` (exponer `POST /api/admin/publicidad/vencer` protegido admin) — reutilizar patrón `POST /evaluar`.

**Interfaces:**
- Consumes: modelos Task 1.
- Produces: `vencer_destacados(session) -> int` (marca VENCIDO donde `vence <= now()` y estado en PENDIENTE/ACTIVO).

- [ ] **Step 1: Test failing** `test_vencer_marca_vencido` — destacado con vence pasado → tras job queda VENCIDO.
- [ ] **Step 2: FAIL, implementar UPDATE, PASS.**
- [ ] **Step 3: Commit** `git commit -m "feat(publicidad): job vencimiento"`

### Task 5: Frontend badge + Publicitar + admin

**Files:**
- Modify: `frontend/src/components/Card.jsx`, `frontend/src/pages/Detalle.jsx` (badge Destacado)
- Create: `frontend/src/pages/Publicitar.jsx` + ruta `/publicitar` en `App.jsx` (lazy como resto)
- Modify: `frontend/src/pages/MisPublicaciones.jsx` (link Publicitar)
- Modify: `frontend/src/pages/AdminDashboard.jsx` (tab publicidad con pendientes + aprobar/rechazar)
- Create: `frontend/src/components/AdSlot.jsx` (render null v1)

**Interfaces:**
- Consumes: `GET /api/publicidad/planes`, `POST /api/publicidad/destacar`, `GET /api/publicidad/mias`, admin endpoints; `api.js` agregar llamadas siguiendo patrón existente.

- [ ] **Step 1: Test failing** `Publicitar.test.jsx` — elige plan 7d y llama POST con `pago_ref`.
- [ ] **Step 2: FAIL, implementar página + llamadas api, PASS.**
- [ ] **Step 3: Badge en Card/Detalle** con `destacado` de API + test `Card.test.jsx` existente ampliado.
- [ ] **Step 4: Tab admin** con aprobar/rechazar + `AdSlot` null.
- [ ] **Step 5: `npm run build` OK + commit** `git commit -m "feat(publicidad): UI destacados y tab admin"`

## Self-Review

- Spec §3→Task 1, §4→Tasks 2-4, §5→Task 5, §7→tests en cada task. Job diario queda como endpoint admin (cron externo después), documentado en Task 4.
- Tipos consistentes: `PublicacionDestacado.estado` PENDIENTE/ACTIVO/VENCIDO/RECHAZADO en todas las tasks.
- Review Focus cubierto: 409 no-ACTIVO y duplicado en Task 2 tests; vencimiento sin borrado en Task 4; orden sin destacados intacto en Task 3 (test regresión).
