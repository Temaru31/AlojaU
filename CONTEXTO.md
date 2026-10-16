# CONTEXTO — AlojaU

> Documento vivo de contexto del proyecto. Actualizado: 2026-10-09. Rama `main` = `a54eed3` (sincronizada con `origin/main`).

## 1. Qué es

**AlojaU** es una plataforma web de vivienda universitaria para Popayán (Colombia). Conecta **estudiantes** que buscan arriendo cerca de su campus con **propietarios (arrendadores)** que publican inmuebles, bajo moderación de **administradores**. Proyecto universitario (Proyecto II, Grupo 5). Monorepo con backend + frontend + BD.

Flujo principal: `Buscar → Filtrar → Comprender → Confiar → Contactar` (estudiante) y `Publicar → Gestionar → Moderar` (propietario/admin).

## 2. Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + Vite 8 + Tailwind 3 + React Router 7 + Axios + Leaflet (+ `leaflet`, `react-leaflet`) + Three.js (solo desktop, lazy) + `lucide-react` 1.53 (iconos, sin emojis en UI) + Supabase JS (solo OAuth Google) |
| Backend | Python 3.11 + FastAPI + Uvicorn + Pydantic v2 + SQLAlchemy 2.0 async + asyncpg + PyJWT HS256 + bcrypt directo |
| BD | PostgreSQL 16 (`schema.sql` canónico + 16 migraciones `005–020` + 20 revisiones Alembic espejo) |
| Local | Docker Compose (PG16 + pgAdmin) |
| Prod $0 | Vercel (frontend) + Render (backend Docker) + Supabase (PG) + Cloudinary (fotos prod) |
| Calidad | pytest (58 archivos) + Vitest (91 archivos, 607 tests) + oxlint + CI con gate coverage 70 % + CodeQL extended + Dependabot |

## 3. Estructura del repo

```
AlojaU/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI: CORS cerrado, CSP, request_id, detector ráfagas 401/403/429, /health, /uploads, 12 routers
│   │   ├── core/              # config (Settings+ENV), security (JWT+jti+RBAC), auth_service, permissions (matriz scopes), pagination, logseguro
│   │   ├── models/            # Ciudad, ZonaBarrio, Campus, Usuario (soft-delete+JSONB+telegram), Publicacion, HousingType, Reporte, Sesion, SystemSetting, ...
│   │   ├── routers/           # 11: admin, admin_automation, auth, campus, ciudades, housing_types, notificaciones, publicaciones, reportes, uploads, zonas
│   │   ├── services/          # 13: trust, search (FTS ES), haversine, publicacion_view, role_lifecycle, storage (Local/Cloudinary), telegram, notifications(+matcher), auto/media_moderation, ciudades, housing_types
│   │   ├── repositories/      # publicacion_repo (queries, renovar, FTS)
│   │   ├── schemas/           # Pydantic (PublicacionCreate/Update, LIMITES)
│   │   └── fixtures/demo.py   # Mocks dev (MOCK_CAMPUS; ids mock ≥10000 para no colisionar)
│   ├── db/
│   │   ├── schema.sql         # DDL canónico (pgcrypto/pg_trgm/unaccent, IDENTITY)
│   │   ├── seed.sql           # Seed v7 idempotente (TRUNCATE+CASCADE): Popayán, 6 zonas, 7 lugares, 6 housing_types, 16 pubs (13 ACTIVO+3 PAUSADO)
│   │   ├── migrations/005–020.sql  # 16 migraciones idempotentes (auth, soft-delete, perfil JSONB, FKs, vistas, auditoría, housing, telegram×5, notificaciones×2)
│   │   └── seeds/prod_demo_insert.sql  # Demo prod SIN truncate (seed.sql NUNCA en prod)
│   ├── alembic/versions/001–020.py # Espejo Alembic de las migraciones
│   ├── scripts/               # seed_db.py (UPSERT demo), seed_all.py (niega prod salvo confirm), ingest_pois_osm.py, limpiar_uploads.py, verificar_telegram_e2e.py
│   ├── tests/ (58)            # auth v13/v131, RBAC, reportes-oráculo, trust, uploads/cloudinary, renovación PA-01, idempotencia, seguridad/redteam, CI directo/fallbacks, schema/índices sync
│   ├── requirements.txt (+ -dev) # bcrypt==4.0.1 pineado, python-multipart, cloudinary, supabase
│   └── Dockerfile + uploads/.gitkeep
├── frontend/src/
│   ├── pages/ (16 rutas)      # `/`=Buscar, `/publicacion/:id`=Detalle, `/comparar`, `/favoritos`, `/publicar`, `/mis-publicaciones`, `/perfil`, `/alertas`, `/auth/callback`, `/recuperar`, `/restablecer`, `/admin/{dashboard,reportes,tipos-vivienda}` (protegidas), `/terminos`, `/privacidad`
│   ├── components/            # Card, Filtros (+MasFiltrosModal), SearchBar (debounce 300 ms), GaleriaFotos/VisorFotos/CarruselFotos, MapaZona/MapPicker (Leaflet local), IndiceConfianza/BadgeConfianza/NivelConfianza, Campanita, UploadFotos, EditarPublicacionModal, RenovarModal, ReportarModal, AdminDashboard piezas, TelegramVincular, AvatarPerfil, Icono (set SVG propio dominio) + TipoIcono (tipos→Lucide), Toast/ConfirmDialog/ErrorBoundary/ColdStartBanner, Paginacion, BreadcrumbsAdmin, HistorialAvisos, GoogleButton/OtpForm/RegistroForm/PasswordStrength
│   ├── contexts/              # AuthContext (memoizado, sync storage, logout total), FavoritosContext + CompararContext (localStorage validado, max 50/3)
│   ├── hooks/                 # useTiposVivienda (catálogo dinámico + fallback), useNotificaciones, useKeepAlive, useMediaQuery, useFocusTrap
│   ├── services/              # api.js (axios + retry solo GET/HEAD/OPTIONS + Idempotency-Key + interceptores), supabaseClient (OAuth lazy PKCE)
│   ├── utils/                 # portada (portadaUrl/fotosOrdenadas), formatters (COP, 80 m/min), historial (etiquetas humanas), sesion (fecha 12 h Bogotá), osrm/geocode, alertas, compressImage, persistenciaBuscar, urls, tiposVivienda, servicios
│   └── constants.js           # fetchConfigPublica (caché 5 min) + diasDesactualizadaEfectiva + contadores
├── docs/ (17)                 # HISTORICO_Y_CONTEXTO (bitácora), HISTORIAL_CAMBIOS, DESPLIEGUE ($0), ARQUITECTURA, AUTH_ENTERPRISE, NOTIFICACIONES+ROADMAP, TELEGRAM_WEBHOOK, SCRUM_Y_QA, SPRINT1_SCOPE, ADMIN_AUTOMATION_SPECS, DEUDA_TECNICA, GUIA_EQUIPO, BUGS_*, IA_BITACORA, PROMPT_PROXIMO_CHAT
├── .github/                   # ci.yml (BE PG16 + gate 70 % + FE vitest/build), codeql.yml (extended, semanal), dependabot.yml
├── scripts/verify_ci.sh       # Réplica local exacta del CI (aborta en prod)
├── docker-compose.yml         # PG16 (schema+seed en init) + pgAdmin (5050)
├── render.yaml + vercel.json  # Deploy prod
├── README.md / SECURITY.md / CONTRIBUTING.md
└── Auditoría HU               # `AlojaU_Story_Map_y_Backlog_Trello.xlsx` (33 tarjetas, 81 SP) + `AUDITORIA_HISTORIAS_DE_USUARIO.md` (+ AUDITORIA.md, *_TAREA_AUDITORIA.md de trabajo)
```

## 4. Backend — lo esencial

**Routers y endpoints clave** (`main.py:255-267`):
- `publicaciones`: `GET /api/publicaciones` (filtros `campus_id, ciudad_id, precio_min/max, tipo, servicios, q` + FTS ES + Haversine + paginación `page/size`, solo ACTIVO en público), `GET /{id}` (404 neutro si no ACTIVO salvo dueño/admin), `POST /` (solo ARRENDADOR, nace **PENDIENTE**, auto-promoción ESTUDIANTE→ARRENDADOR, throttle 10/h, `Idempotency-Key` TTL 24 h), `GET /mias` (dueño, `?orden=recientes|vistas|estado` server-side), `PATCH /{id}` + `/{id}/fotos` (edición atómica) + `/{id}/estado` (ACTIVO↔PAUSADO, 409 desde PENDIENTE) + `/{id}/renovar` (+30 d, `EXPIRADO→ACTIVO`, audit RENEWED) + `DELETE` (democión), `GET /similares` (excluye propio dueño), `POST /vista` (dedup SHA256 IP+día + throttle 120/min), `GET /config-publica` (público: umbrales, límites, tipos).
- `auth` (~3000 lín): register (Ley 1581: consentimiento+IP+versión) / login (rate-limit) / OTP (6 díg, 10 min, canal email|telegram, cooldown 60 s, throttles) / recovery un solo uso / Google OAuth (JWKS, linking por email) / sesiones + `logout/logout-all` (revocación JTI) / avatar 5 MB / soft-delete 30 d + restore + purga / promover.
- `admin`: métricas (+`inmuebles_con_reportes`), pendientes, aprobar/rechazar/pausar (+democión), delete, bulk approve/reject (+`democionados[]`), `GET /auditoria` (mensaje legible), purga cuentas. `admin_automation`: settings por secciones + `POST /evaluar` (auto-pausa por reportes ≥ umbral).
- `reportes`: `POST` anónimo→PENDIENTE + oráculo mismo-404 + `GET/PATCH` admin. `uploads`: `POST /upload` (+`/una`, `/vincular`, `/orden`, `DELETE /{foto_id}`): 3–10 fotos, 5 MB, MIME+magic-bytes, uuid seguro, Cloudinary prod / disco dev. `notificaciones` + `busquedas-guardadas`: alertas anti-spam (≥1 filtro, tope 10), matcher set-based. `campus/ciudades/zonas`: catálogos con `Cache-Control: public, max-age=3600`. `housing_types`: catálogo 6 slugs (FK RESTRICT) + CRUD admin auditado.

**Auth/roles/seguridad**: JWT HS256 2 h (`exp+sub+jti`); revocación central JTI (fail-closed 503 en prod); matriz scopes `permissions.py` (ESTUDIANTE/ARRENDADOR/ADMIN + futuros); `require_arrendador` (relectura BD + caché 60 s anti-stale post-promoción) y `require_admin` deny-default; CORS sin `*` (sin PUT); CSP + security headers + request_id + detector ráfagas 401/403/429 (sin PII, Ley 1581); sanitización directa anti-CodeQL (17 alertas→0); desinfección de logs (anti CWE-117).

**Índice de confianza** (`trust.py`): 40 completitud + 20 teléfono + 15 fotos + 15 vigencia + 10 reportes = 0–100 reproducible, pesos configurables vía settings, disclaimer incluido. Renovación recupera vigencia implícitamente (`fecha_renovacion=now`).

**BD**: estados `PENDIENTE/ACTIVO/PAUSADO/PAUSADO_POR_REPORTE/EXPIRADO/RECHAZADO`; auditoría `012` (CREATED/APPROVED/REJECTED/PAUSED/RESUMED/RENTED/EXPIRED/RENEWED/BLOCKED/SETTINGS/CUENTA_DELETE, `publicacion_id` NULLABLE); vistas con dedup; telegram (chat_id, vínculos HMAC 1 uso 5 min, idempotency keys); notificaciones (019/020); POIs 004 + Haversine + OSRM peatonal.

## 5. Frontend — lo esencial

**Patrones que hay que respetar**:
- Búsqueda: `SearchBar` (estado local + **debounce 300 ms**, Enter inmediato) y filtros (debounce 400 ms) escriben la **URL** (`useSearchParams`); UN solo efecto fetchea por `queryString` con **AbortController** (cancela en vuelo) y página `size: 9`. No hay request por tecla.
- `GET /config-publica` (caché memoria+localStorage 5 min) gobierna umbrales (`dias_desactualizada`), límites de publicar y catálogo de tipos.
- **Sin emojis en UI**: todo icono es `lucide-react` o `Icono`/`TipoIcono` (SVG inline). `t.icono` de tipos guarda **nombres** (`house, door-open, building, handshake, building-2, home`); `TipoIcono` mapea emojis legacy por compatibilidad con BDs viejas.
- Favoritos/comparar en localStorage validado; auth por `AuthContext` (nav decide por **usuario verificado**, no token crudo); `Casa3D` solo desktop vía `React.lazy` + `useMediaQuery`; rutas admin tras `ProtectedAdminRoute`; toasts texto plano.

**Datos demo**: `arrendador@alojau.com` / `admin@alojau.com`, clave `AlojaU123`.

## 6. Historias de usuario

Fuente: `AlojaU_Story_Map_y_Backlog_Trello.xlsx` — 33 tarjetas (S1: 15, S2: 11, S3: 7), 81 SP. Estado (ver `AUDITORIA_HISTORIAS_DE_USUARIO.md`): **31/33 cumplidas + 2 parciales menores** (`HU-001C`: falta tipo en Card; `EN-006/007`: pesos trust sin acta, bonus renovación implícito), 0 incumplidas. Extras no planificados formalizados como propuesta `HU-011…022 / EN-012…015` (notificaciones in-app, Telegram, auth empresarial, tipos, vistas/similares, edición atómica, Cloudinary, idempotencia, CI/CodeQL…).

## 7. Calidad y CI

- Backend 58 archivos de test (auth, RBAC, reportes-oráculo, trust, uploads, renovación, idempotencia, redteam, CI directo/fallbacks, sync schema/índices); frontend 91 archivos / **607 tests en verde**; `npm run build` OK; `oxlint` 0 errores.
- `.github/workflows/ci.yml`: BE (PG16 + `schema.sql` + `migrations/*.sql` en orden + gate coverage 70 %) y FE (vitest + build); `scripts/verify_ci.sh` lo replica en local y aborta si detecta prod.
- Reglas: sin `--force`, sin secretos en repo (solo `.example`), migraciones idempotentes, tests que leen restauran (no ensucian seed).

## 8. Cómo correr y desplegar

**Local (3 terminales)** — ver `README.md:10-39`:
1. `docker compose up -d` (PG `alojau/alojau123@localhost:5432/alojau`; pgAdmin `:5050`). En primera creación aplica `schema.sql`+`seed.sql` solos.
2. `cd backend` → venv → `pip install -r requirements.txt` → `cp .env.example .env` → `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000` (docs en `/docs`, health en `/health`).
3. `cd frontend` → `npm install` → `cp .env.example .env` (`VITE_API_URL=http://localhost:8000`) → `npm run dev` (`:5173`).
- Migraciones `007→020` en BD local ya creada: aplicar `backend/db/migrations/*.sql` en orden (ver `verify_ci.sh` como referencia).

**Prod $0**: push a `main` → Vercel + Render redespliegan solos. **Supabase es manual**: pegar cada migración nueva en SQL Editor (nunca `seed.sql`: hace TRUNCATE). Env vars solo en dashboards. Ver `docs/DESPLIEGUE.md`.

## 9. Estado actual (2026-10-09, noche)

- `main` = `739f6ee` (+ `3007079` F2, `eb7826a`, `30a4857` F1; sin push: `main...origin/main [ahead 4]`). Limpio salvo 6 untracked de trabajo (`AUDITORIA*.md`, `*.xlsx`, `*_TAREA_AUDITORIA.md`, `CONTEXTO.md` este archivo).
- Nuevo: **chatbot MVP solo lectura** F1–F3 (ver §10). Apagado por defecto.
- Backend: 59 archivos de test; frontend: 92 archivos / 615 tests en verde.
- Pendientes conocidos: aplicar mig 021 en Supabase prod (+ `ALTER ROLE chatbot_ro LOGIN`, `CHAT_DATABASE_URL` y `CHAT_ENABLED` al final); E2E con proveedor real la hace el operador; resto previo (vistas_dedup/FKs, rotar secreto Google + token Telegram, caché `require_arrendador`, acta pesos trust, Dependabot 6 avisos).

## 10. Chatbot MVP (solo lectura, F1–F3, apagado por defecto)

- **F1 datos**: mig `021_chatbot_readonly` (9 vistas `chat_v_*` security_barrier solo ACTIVO + rol `chatbot_ro` NOLOGIN/LIMIT 5/timeout 3s/read-only, REVOKE resto) + espejo Alembic + `schema.sql`; `db/chat_session.py` (engine separado, fail-closed); `services/chat/readonly_queries.py` (solo `select()` + FTS normalizado con fallback ILIKE-OR).
- **F2 backend**: 5 tools allowlist (`extra="forbid"`, salida recortada ≤5 + bloques DATOS), orquestador (máx. 3 iters, filtro anti-PII/secretos/eco), FakeLLM + adapter OpenAI-compatible (urllib, `to_thread`), kb 9 docs, `POST /api/chat` (auth opcional solo p/rate-limit, throttle IP/usuario, tope diario + breaker, kill switch, logs sin PII), `chat_enabled` en `/config-publica`.
- **F3 frontend**: `ChatWidget` lazy (oculto en `/admin/*` y si `chat_enabled=false`, texto plano, historial local, 429/error/reintento); aviso en `/privacidad` (texto legal versionado intacto).
- **Seguridad**: test AST anti-escritura (cubre router), `SET ROLE` (12 tablas ilegibles, escritura/DDL denegados), inyección vía contenido, allowlist, visibilidad, kill switch, logs. Regla permanente: el bot sigue read-only; escrituras futuras en el front con token del usuario.
- Docs: `docs/CHATBOT.md` (arquitectura, env, probar con Fake, roadmap v2/v3).
