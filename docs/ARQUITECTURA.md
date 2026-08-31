# Arquitectura AlojaU — Sprint 1

## Stack oficial (p22)
- Frontend: React 18 + Vite + Tailwind 3 + Router 7 + Leaflet + Axios
- Backend: Python 3.11/3.12 + FastAPI + Uvicorn + Pydantic v2 + OpenAPI
- BD: PostgreSQL 16 + SQLAlchemy 2.0 async + asyncpg + Alembic
- Infra: Vercel (frontend) + Render/Railway (backend) + Supabase/Neon (PG) + Cloudinary

## Monolito modular (no microservicios)
```
frontend/src → pages, components, services, hooks, utils
backend/app → core, db, models, schemas, routers, services
```

## Flujo valor
`Buscar (campus + Haversine) → Filtrar (precio/tipo/servicios) → Detalle (canon, servicios, reglas) → Confiar (índice 0-100) → Contactar (wa.me)`

## Índice confianza (Tabla14:25)
`40 completitud +20 teléfono verificado +15 fotos≥3 +15 vigencia≤30d +10 sin reportes PENDIENTE/CONFIRMADO =100`
- 80-100 alto verde, 50-79 medio amarillo, 0-49 básico naranja + disclaimer “Informativo, no garantiza seguridad”

## Máquina estados (Tabla15:25)
`PENDIENTE → ACTIVO/RECHAZADO → PAUSADO ↔ ACTIVO → ARRENDADO/EXPIRADO/DESACTIVADO`
- Toda publicación nace PENDIENTE, audit en `publicaciones_audit` (CREATED, APPROVED, etc.)
- Solo ACTIVO es público. Vigencia 30d, expiración automática.

## Haversine (p26)
`d=2*R*asin(sqrt(sin²Δφ/2+cosφ1cosφ2 sin²Δλ/2)) R=6371000`
- Almacena `publicacion_campus.distancia_geodesica_m` precalculado. No prometer tiempo a pie.

## NFR verificables (Tabla16:27)
- P95 <500ms GET /api/publicaciones?campus_id bajo 50req/s, LCP <2.5s 4G
- 50-100 concurrentes Locust, SLA 98% (cold start 15s Render)
- JWT HS256 8h + bcrypt, SQL parametrizada, CORS, wa.me encodeURIComponent
- Índices: `(estado, canon_mensual)` + GIN `campus_id`

## ER corregido (bugs p92 informe)
- `publicaciones` + `latitud DECIMAL(10,7)`, `longitud DECIMAL(10,7)`, `indice_confianza SMALLINT`, `GENERATED AS IDENTITY`
- Tabla faltante `publicaciones_audit` + `reportes estado PENDIENTE/DESCARTADO/CONFIRMADO`
- Haversine SQL `haversine_m()` IMMUTABLE + trigger

## Despliegue $0
Vercel + Render free tier + Supabase free (500MB). Cold start 15s asumido.

Ver: `backend/db/schema.sql`, `backend/db/seed.sql`, `docs/SCRUM_Y_QA.md`
