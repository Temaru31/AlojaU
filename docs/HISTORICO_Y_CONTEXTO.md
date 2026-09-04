# AlojaU — Histórico de Implementación y Contexto para Nuevo Chat
> **No borrar:** historial real ejecutado y punto de partida para siguiente chat/sprint. Creado 2026-08-31 02:15 (UTC-5). Actualizado **2026-08-31 08:50** (UTC-5). Ramas: `main` en `843a4f8` (local, pendiente push a `origin/main` que está en `fee7cc7`), `origin/develop` y 6 `feature/HU-*`. Tests: **backend 47 passed + frontend 38 passed = 85** (build 483kB ok). DB: 6 ACTIVO + 20 imgs Unsplash. Servicios: `uvicorn:8000` + `vite:5173` verificados con MCP Firefox 1280/500.

---

## 0) Para nuevo chat / IA — Lee primero (30s)

**Orden de lectura:** `1` este archivo (`§1, §5, §6`) → `2` `docs/SCRUM_Y_QA.md §4.2` (Gherkin DoD) → `3` `docs/SPRINT1_SCOPE.md` (alcance PO) → `4` `git status && git log --oneline -5 && git diff --stat`.

**Checklist arranque:**
```
git status                 # debe estar limpio (commit 843a4f8). Si ves "a medias", este doc ya resolvió
PYTHONPATH=backend pytest -q  # 47 passed
cd frontend && npm run test:run # 38 passed
curl -s http://localhost:8000/health | jq
curl -s "http://localhost:8000/api/publicaciones?campus_id=1&page=1&size=3" | jq '{total,pages,items:(.items|length)}'
```

**Stack y endpoints clave:**
- `GET /health`, `GET /api/campus` (2), `GET /api/publicaciones?campus_id&precio_min&precio_max&tipo&servicios&page&size` → `{items,total,page,size,pages}`, `GET /api/publicaciones/{id}`, `POST /api/publicaciones` (PENDIENTE, solo ARRENDADOR, JWT HS256 8h)
- `POST /api/auth/login` (demo `arrendador@alojau.com/AlojaU123` o `mock-token-arrendador`)

---

## 1) Resumen ejecutivo (qué se hizo)

**Objetivo Sprint1:** `Buscar → Filtrar → Entender → Confiar → Contactar` + `Publicar PENDIENTE` demoable sin depender de IA.

**Entregado y commiteado (commit `843a4f8`):**
- **Backend:** `GET /health`, `GET /api/campus`, `GET /api/publicaciones` con filtros combinados + paginación + Haversine ordenado, `GET /api/publicaciones/{id}` con índice, `POST /api/publicaciones` PENDIENTE + JWT, validación `Query(ge/le/max_length)` + Pydantic.
- **Frontend:** `Buscar` con `useSearchParams` + debounce 400ms + `Paginacion.jsx`, `Filtros` multi-checkbox 5 servicios, `Detalle` con fotos, servicios, `IndiceConfianza` friendly desplegable, tiempo caminando `80m/min`, `MapaZona` Leaflet, `Card` sin overflow, `Publicar` funcional ARRENDADOR, `Comparar` 2-3 tabla, `Favoritos` corazón.
- **Seguridad + pruebas + UX** pulidos y verificados con capturas MCP Firefox (Desktop 1280 y Mobile ~500) y `curl` (CORS, headers, SQLi, XSS).

**Estado actual:** paginación COMPLETADA, filtros multi COMPLETADOS, favoritos/comparar IMPLEMENTADOS y testeados. Sin deuda de paginación.

---

## 2) Histórico por fases (con archivos:línea)

### Fase 0 — Arranque (ya existía)
- `docker-compose.yml:2` PG16 + pgAdmin, `backend/.env.example:2` `DATABASE_URL`, `frontend/vite.config.js:5` proxy `/api`.

### Fase 1 — DB real con 6 pubs (fix crítico)
**Problema:** API devolvía 2 mock (`publicaciones.py:33` MOCK_PUBS) en vez de 6 de `seed.sql:30`. **Causa:** `app/routers/publicaciones.py:144` import mal (`models/publicacion.py:7` solo Ciudad/Zona/Campus), faltaban `relationship` y `pub_id` vs `publicacion_id`. **Fix:** `backend/app/models/__init__.py:91` relaciones `Publicacion` (`zona/usuario/servicios/imagenes/campus_links` `secondary="publicacion_servicios"`), `PublicacionServicio:147` y `PublicacionCampus:160` corregidos, `ImagenPublicacion:179`, `PublicacionesAudit:202` alineado a `schema.sql:119`. Verificación: `curl /api/publicaciones →6` (111/157/176/434/712/780m).

### Fase 2 — Fotos, confianza, tiempo, responsive
- **Fotos:** `seed.sql:62` cloudinary 404/picsum 522 → Unsplash `images.unsplash.com/...?w=600` (`curl -I 200`), `Card.jsx:12` fallback, `Detalle.jsx:39` grid 2/3.
- **Confianza:** `IndiceConfianza.jsx:1` de lista técnica 40/20/15/15/10 a friendly círculo `100/100` `¡Se ve bien!`, barra `width: indice%`, botón `Ver por qué ▼` con 5 factores, disclaimer. Test 6 passed.
- **Tiempo:** `utils/formatters.js:6` `formatTiempoCaminando(m)=Math.round(m/80)` (4.8km/h Singapore, sin ruteo), `Card.jsx:10` `111m • ~1 min • Tulcán`.
- **Responsive:** `Card.jsx:11` `overflow-hidden min-w-0 line-clamp-2`, `Filtros.jsx:1` `grid grid-cols-2 sm:flex`, `Buscar.jsx:17` `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.

### Fase 3 — Seguridad (DoD-5 OWASP)
- `backend/app/core/config.py:14` `SECRET_KEY >=32` + `ENV=prod` check, `CORS_ORIGINS` env `cors_origins_list`.
- `backend/app/main.py:19` `CORSMiddleware` sin `"*"` (solo `GET/POST/PUT/PATCH/DELETE/OPTIONS`, `Authorization,Content-Type`), headers `nosniff/DENY`.
- `backend/app/core/security.py:25` `get_current_user` split/strip/lower `bearer` + mock solo `USE_MOCK_FALLBACK && ENV!=prod`.
- `backend/app/routers/publicaciones.py:228` `Query(ge/le/max_length)` + servicios max 10, `Path(ge=1)`.

### Fase 4 — HU-005 Publicar funcional
- `frontend/src/pages/Publicar.jsx:1` 321 líneas: login `POST /api/auth/login` (demo `arrendador@alojau.com/AlojaU123` o `mock-token-arrendador`), validación `titulo 10-150/descripcion 20-2000/tipo/canon>0/zona/dirección 10+/reglas 10+/lat/lon/servicios[]/campus[]/fotos 3-10 HttpUrl`, `POST /api/publicaciones` Bearer → `PENDIENTE` + `indice/desglose`, `Detalle.jsx:12` banner PENDIENTE oculta WhatsApp si `!isActivo`.

### Fase 5 — Pruebas automatizadas (no IA)
- **Backend 44→47** (`PYTHONPATH=backend pytest -q`): `test_haversine 3`, `test_trust 3`, `test_api 6`, `test_hu_sprint1 16+3`, `test_security 16`.
- **Frontend 30→38** (`npm run test:run`): `formatters 9`, `Card 10`, `Filtros 5`, `IndiceConfianza 6`, `Paginacion 8`, `vite.config.js:6` `jsdom`.
- `vite build` 483kB, `oxlint` solo warnings `setState in effect`, `py_compile` ok.

### Fase 6 — Paginación COMPLETADA (2026-08-31 08:50, commit 843a4f8)
- `backend/app/core/pagination.py:1` helper `paginate_params/build_paginated` (`pages=(total+size-1)//size`, validación 1..50).
- `backend/app/routers/publicaciones.py:130` `_query_db_lista(page,size)` + `list_publicaciones:229` `page=1,size=9` (`ge=1,le=50`), paginación en memoria + mock paginado.
- `frontend/src/components/Paginacion.jsx:1` prev/next + 5 números + ellipsis, `Buscar.jsx:1` `useSearchParams` + debounce 400ms + URL state + soporta `array` legacy y `{items,total}`.
- `backend/tests/test_api.py:1` helper `_items()` y `test_hu_sprint1.py:32` `+3 test_paginacion_*` → 47 passed. `frontend/src/components/Paginacion.test.jsx:1` 8 tests + `Filtros.jsx:1` multi-checkbox 1..5 (`toggleServicio`) → 38 passed.

### Fase 7 — Diferenciación AlojaU (2026-08-31 08:50, commit 843a4f8)
- `frontend/src/contexts/FavoritosContext.jsx:1` y `CompararContext.jsx:1` localStorage validado (`parseStored` filtra 1..1M, max 50/3), `storage` sync, fallback seguro sin provider, sin secretos.
- `frontend/src/components/Card.jsx:1` botones `♥/♡` y `✓/+` overlay (`stopPropagation`, `aria-pressed`), `App.jsx:1` `FavoritosProvider/CompararProvider` + badges `♡ 2` y `2/3` en nav.
- `frontend/src/pages/Comparar.jsx:1` tabla 2-3 `canon/depósito/tipo/zona/distancia/tiempo/índice/servicios/fotos/dirección` con `No informado`, fetch paralelo, `Detalle.jsx:1` botones fav/comparar + error si >3.
- Verificado MCP Firefox: Buscar 1280 (3 cols) y 500 (1 col), Detalle Leaflet + WhatsApp, Comparar 2/3 tabla, filtros `tipo=APARTAESTUDIO` (2) y `servicios=1,4` (2). `curl` CORS/headers/SQLi 422/XSS 201 sin exec ok.

---

## 3) Gestión de seguridad (resumen)

| Capa | Medida | Archivo | Verificación |
|------|--------|---------|--------------|
| Auth | JWT HS256 8h + bcrypt, mock solo dev | `security.py:25` `config.py:14` | `test_security.py:12` 401/403 |
| Inyección | SQLAlchemy parametrizada, no f-string | `publicaciones.py:165` | `SQLi 422` |
| XSS | React escape, no `dangerouslySetInnerHTML` | `Card.jsx` | `XSS 201 sin exec` |
| CORS | Sin `*`, solo localhost/Vercel env | `main.py:19` | `curl Origin` |
| Validación | Pydantic `Field(gt,min_length,HttpUrl)` + Query `ge/le` | `schemas/publicacion.py:7` `publicaciones.py:228` | `422` |
| Fotos | 3-10 `HttpUrl`, 5MB `image/*`, local/Cloudinary | `Publicar.jsx:41` | manual |
| Storage | localStorage solo ids, validado, max 50/3, no PII | `FavoritosContext.jsx:8` | manual |

---

## 4) Pruebas unitarias (detalle actualizado)

**Backend 47 passed** (`PYTHONPATH=/home/angel/Escritorio/AlojaU/backend python3 -m pytest -q` necesita PG):
- `test_haversine.py:1` 3 (0m, Tulcán-Pandiguando 400-600m), `test_trust.py:1` 3 (100/0, bug reportes PENDIENTE/CONFIRMADO), `test_api.py:1` 6 (health/campus/filtro 400/401/paginado), `test_hu_sprint1.py:1` 19 (HU-001 C1-3, HU-002 C1-3, HU-003 C1/C3, HU-005 C1-3, HU-007, HU-008 + 3 paginación), `test_security.py:1` 16 (CORS, headers, SQLi, XSS, servicios largo 400).

**Frontend 38 passed** (`cd frontend && npm run test:run`):
- `formatters.test.js:1` 9 (COP, distancia, tiempo `80m/min`), `Card.test.jsx:1` 10 (overflow, fotos array/número, truncate), `Filtros.test.jsx:1` 5 (responsive, multi-checkbox), `IndiceConfianza.test.jsx:1` 6, `Paginacion.test.jsx:1` 8 (1 página/ellipsis/disabled). `vite.config.js:6` `jsdom` + `src/test/setup.js:1` `jest-dom`.

**Histórico:** 0 → 47+38=85 tests. `npm run build` 483kB, `npm run lint` solo warnings `setState in effect`, `npm audit 0`.

---

## 5) Estado actual exacto (para retomar sin alucinar)

**Git:**
- `main` en `843a4f8` (local, pendiente `git push origin main`; `origin/main` aún en `fee7cc7`), `develop` y 6 `feature/HU-*` en remoto. Último commit: `feat(sprint1): paginación URL+debounce completa, filtros multi-servicios, favoritos/comparar localStorage` (15 files).
- `git status` limpio. Para ver diff previo: `git show fee7cc7..843a4f8 --stat`.

**DB:**
- `alojau` PG16 `alojau_db:5432` con 6 ACTIVO (IDs 1-6 Tulcán/Centro/Pandiguando) y 20 imgs Unsplash, `publicaciones_id_seq=6`, sin PENDIENTE residual (`DELETE WHERE estado='PENDIENTE' AND id>6`).

**Servicios:**
- `docker-compose.yml:2` `alojau_db:5432` + `alojau_pgadmin:5050` (o Supabase), `uvicorn app.main:app --reload --port 8000` (PID 34479), `vite --host 0.0.0.0 --port 5173` (PID 35261). Si no están: `docker-compose up -d && cd backend && uvicorn app.main:app --reload --port 8000` + `cd frontend && npm run dev`.

**Puntos críticos:**
- `models/__init__.py:91` `secondary="publicacion_servicios"`; `publicacion_id` no `pub_id`.
- `MOCK_PUBS` usa `campus_ids`/`servicios_ids`, `max id 10000` para no colisionar.
- `Buscar.jsx:1` maneja ambos formatos (`Array.isArray(data)?...:data.items`) pero ahora siempre paginado.
- `Filtros.jsx:1` multi `servicios=1,3` (no solo `1`).
- `Favoritos/Comparar` usan `localStorage` keys `alojau_favoritos`/`alojau_comparar`, validados.

---

## 6) Lo que queda importante por desarrollar (orden lógico)

**Hecho en esta sesión (no repetir):** paginación + filtros multi + favoritos/comparar (ver §2 Fase 6-7). Ya tienen tests y capturas.

**Pendiente prioritaria:**

**1. Subida real de fotos (prioridad 1, ~1 día):**
- Backend: `POST /api/publicaciones/upload` multipart `UploadFile`, validar `3-10` files, `max 5MB`, `content-type image/*`, guardar en `backend/uploads/{uuid}.jpg` (crear `mkdir -p uploads` + `.gitignore`) o Cloudinary si `CLOUDINARY_URL`, retornar `{"urls": [...]}` + `StaticFiles("/uploads")`. Añadir `python-multipart` a `requirements.txt`, test `test_upload.py` (3 fotos ok, 2 →422, 5MB →413, tipo txt →400, sin auth 401 si se protege).
- Frontend: `Publicar.jsx` cambiar 3 inputs URL a `<input type="file" multiple accept="image/*">` con preview `URL.createObjectURL`, drag-drop, validación tamaño, botón `Subir` → `/upload` → URLs → `POST /api/publicaciones`. `UploadFotos.jsx` reutilizable. Test `Publicar.test.jsx`.

**2. QA / código limpio (tu pedido, ~0.5 día):**
- Refactor `publicaciones.py:_query_db_lista` (80 líneas, N+1 reportes): extraer `get_distancia(p,campus_id)` y `build_trust(p, usuario, reportes)` + query paginada con `LIMIT/OFFSET` en SQL cuando >100 (ahora en memoria ok para 6).
- `Publicar.jsx` 321→ extraer `usePublicarForm` hook + `LoginForm` componente.
- Añadir `ruff`/`mypy` backend y `eslint` reglas, `pre-commit` para no subir `.env`.

**3. Pulir diferenciación (opcional, ya base está):**
- Vigencia visible mejorada en Card (badge `Vigencia 30d` ya está, pero mostrar `D-12` si expira pronto).
- Test E2E `Comparar.test.jsx` y `Favoritos.test.jsx` (localStorage mock).

**No hacer en Sprint1** (Tabla23:34): HU-006 Renovar, HU-010 Moderación, Pagos, Chat, IA matching.

---

## 7) Cómo proceder en nuevo chat (paso a paso, sin desalinearse)

1. **Nuevo chat:** pega `Lee docs/HISTORICO_Y_CONTEXTO.md §0-§5 y docs/SCRUM_Y_QA.md §4.2` + `git status` + `git log --oneline -5`.
2. **Verifica entorno:** `docker-compose ps; curl -s http://localhost:8000/health | jq; curl -s "http://localhost:8000/api/publicaciones?campus_id=1&page=1&size=3" | jq '{total,pages,items:(.items|length)}'; PYTHONPATH=backend pytest -q; cd frontend && npm run test:run && npm run build`
3. **Siguiente feature:** elige **Subida real fotos** (ver §6.1) → rama `feature/HU-005-upload` desde `develop`, implementa `uploads.py` + `UploadFotos.jsx`, test, `git commit -m "feat(upload): multipart 3-10 imgs"` + captura.
4. **QA:** refactor `_query_db_lista`, `git commit -m "refactor(publicaciones): extraer trust/distancia"`.
5. **Push:** `git push origin main` (o PR `develop→main` según `SCRUM_Y_QA.md:90`).

> **Regla de oro PDF p34:** no prometer pagos/chat/IA ni tiempo ruteado; solo Haversine + disclaimer `Informativo, no garantiza seguridad.`.

---

## 8) Comandos de verificación rápida (copy-paste)

```bash
# infra
docker-compose ps; curl -s http://localhost:8000/health | jq; curl -s http://localhost:5173 | head
# backend 47 tests
PYTHONPATH=/home/angel/Escritorio/AlojaU/backend python3 -m pytest -q
# frontend 38 tests + build
cd frontend && npm run test:run && npm run build && npm run lint
# paginación + filtros combinados
curl -s "http://localhost:8000/api/publicaciones?campus_id=1&page=1&size=2" | jq '{total,pages,items:(.items|length),ids:[.items[].id]}'
curl -s "http://localhost:8000/api/publicaciones?campus_id=1&tipo=APARTAESTUDIO&servicios=1&page=1&size=9" | jq '[.items[]|{id,tipo,servicios_ids}]'
# foto upload (cuando exista)
curl -s -X POST http://localhost:8000/api/publicaciones/upload -F files=@/tmp/test.jpg -H "Authorization: Bearer mock-token-arrendador" | jq
# seguridad
curl -s -I -H "Origin: http://localhost:5173" http://localhost:8000/health | grep -i access-control
curl -s "http://localhost:8000/api/publicaciones?campus_id=1; DROP" | head
```

---

## 9) Bitácora de sesión 2026-08-31

| Fecha | Qué se hizo | Validación |
|-------|-------------|------------|
| 08:50 | Corregidos 7 tests fallidos por paginado (`_items()` + 3 nuevos) → 47 backend | `pytest -q` 47 passed |
| 08:50 | Filtros multi 5 servicios + Paginación URL state + debounce | `vitest 38 passed`, capturas 1280/500 |
| 08:50 | Favoritos/Comparar localStorage (validados, max 50/3, sin PII) + Card/Detalle/Comparar UI | MCP Firefox: Buscar, Detalle Leaflet, Comparar 2/3 tabla, nav badges |
| 08:50 | Build 483kB, lint solo warnings, `py_compile` ok, `curl` CORS/SQLi/XSS ok | `vite build` + `curl -I` |

*Próximo: subida fotos multipart + refactor trust/distancia. Repo en `843a4f8` local, push pendiente a `origin/main`.*

