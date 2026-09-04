# AlojaU — Histórico de Implementación y Contexto para Nuevo Chat
> **No borrar:** historial real ejecutado y punto de partida para siguiente chat/sprint. Creado 2026-08-31 02:15 (UTC-5). Actualizado **2026-09-02 01:30** (UTC-5). Ramas: `main` en `feed76b` (pusheado a `origin/main`), `origin/develop` y 6 `feature/HU-*`. Tests: **backend 47 passed + frontend 38 passed = 85** (build 492kB ok, `python-multipart` incluido). DB: 6 ACTIVO + 20 imgs Unsplash + 1 test 10 fotos PENDIENTE limpiado. Servicios: `uvicorn:8000` (sin --reload) + `vite:5173` verificados con MCP Firefox 1280/500 + prod `https://aloja-u.vercel.app` / `https://alojau-api.onrender.com` con 6 reales.

---

## 0) Para nuevo chat / IA — Lee primero (30s)

**Orden de lectura:** `1` este archivo (`§1, §5, §6`) → `2` `docs/SCRUM_Y_QA.md §4.2` (Gherkin DoD) → `3` `docs/SPRINT1_SCOPE.md` (alcance PO) → `4` `git status && git log --oneline -5 && git diff --stat`.

**Checklist arranque:**
```
git status                 # debe estar limpio (commit feed76b). Si ves "a medias", ya está resuelto
PYTHONPATH=backend pytest -q  # 47 passed (incluye fix bcrypt 4.0.1 y logs DB)
cd frontend && npm run test:run # 38 passed
npm run build              # 492kB (con UploadFotos+Visor)
curl -s http://localhost:8000/health | jq
curl -s "http://localhost:8000/api/publicaciones?campus_id=1&page=1&size=3" | jq '{total,pages,items:(.items|length)}'
curl -s http://localhost:8000/api/publicaciones/1 | jq '.fotos | length' # 4
```

**Stack y endpoints clave:**
- `GET /health`, `GET /api/campus` (2), `GET /api/publicaciones?campus_id&precio_min&precio_max&tipo&servicios&page&size` → `{items,total,page,size,pages}`, `GET /api/publicaciones/{id}`, `POST /api/publicaciones` (PENDIENTE, ARRENDADOR, JWT HS256 8h), **`POST /api/publicaciones/upload` (multipart 3-10, 5MB, image/*, ARRENDADOR, retorna {urls})**, `GET /uploads/{uuid}.jpg` (StaticFiles)
- `POST /api/auth/login` (demo `arrendador@alojau.com/AlojaU123` o `mock-token-arrendador`)
- Prod: `https://aloja-u.vercel.app` (Vercel) + `https://alojau-api.onrender.com` (Render, Supabase 6 pubs, CORS `https://aloja-u.vercel.app`)

---

## 1) Resumen ejecutivo (qué se hizo)

**Objetivo Sprint1:** `Buscar → Filtrar → Entender → Confiar → Contactar` + `Publicar PENDIENTE` demoable sin depender de IA.

**Entregado y pusheado hasta `feed76b`:**
- **Backend:** `GET /health`, `GET /api/campus`, `GET /api/publicaciones` con filtros + paginación + Haversine, `GET /api/publicaciones/{id}` con índice, `POST /api/publicaciones` PENDIENTE + JWT, **`POST /api/publicaciones/upload` + `GET /uploads/*`**, validación `Query(ge/le/max_length)` + Pydantic, `bcrypt==4.0.1` fix, logs DB explícitos.
- **Frontend:** `Buscar` con `useSearchParams` + debounce 400ms + `Paginacion.jsx`, `Filtros` multi-checkbox 5 servicios, `Detalle` con **`GaleriaFotos` responsive + `VisorFotos` lightbox**, `IndiceConfianza` friendly, tiempo `80m/min`, `MapaZona` Leaflet, `Card` sin overflow, **`Publicar` con `UploadFotos` drag-drop + preview**, `Comparar` 2-3 tabla, `Favoritos` corazón.
- **Seguridad + pruebas + UX** pulidos y verificados con MCP Firefox (Desktop 1280 y Mobile 500, galería +3/+9, visor 2/10) y `curl` (CORS, headers, SQLi, XSS, upload 3/422/400/413).

**Estado actual 2026-09-02 01:30:** upload real + galería +10/+3 y visor **COMPLETADOS y pusheados** (`feed76b`). Sin deuda de paginación ni de fotos URL. Prod con 6 reales.

---

## 2) Histórico por fases (con archivos:línea)

### Fase 0 — Arranque (ya existía)
- `docker-compose.yml:2` PG16 + pgAdmin, `backend/.env.example:2` `DATABASE_URL`, `frontend/vite.config.js:5` proxy `/api`.

### Fase 1 — DB real con 6 pubs (fix crítico)
**Problema:** API devolvía 2 mock (`publicaciones.py:33`) en vez de 6 de `seed.sql:30`. **Causa:** `app/routers/publicaciones.py:144` import mal (`models/publicacion.py:7` solo Ciudad/Zona/Campus), faltaban `relationship` y `pub_id` vs `publicacion_id`. **Fix:** `backend/app/models/__init__.py:91` relaciones `Publicacion` (`zona/usuario/servicios/imagenes/campus_links` `secondary="publicacion_servicios"`), `PublicacionServicio:147` y `PublicacionCampus:160` corregidos, `ImagenPublicacion:179`, `PublicacionesAudit:202` alineado a `schema.sql:119`. Verificación: `curl /api/publicaciones →6` (111/157/176/434/712/780m).

### Fase 2 — Fotos, confianza, tiempo, responsive
- **Fotos:** `seed.sql:62` cloudinary 404/picsum 522 → Unsplash `images.unsplash.com/...?w=600` (`curl -I 200`), `Card.jsx:12` fallback, `Detalle.jsx:39` grid 2/3.
- **Confianza:** `IndiceConfianza.jsx:1` de lista técnica 40/20/15/15/10 a friendly círculo `100/100` `¡Se ve bien!`, barra `width: indice%`, botón `Ver por qué ▼` con 5 factores, disclaimer. Test 6 passed.
- **Tiempo:** `utils/formatters.js:6` `formatTiempoCaminando(m)=Math.round(m/80)` (4.8km/h, sin ruteo), `Card.jsx:10` `111m • ~1 min • Tulcán`.
- **Responsive:** `Card.jsx:11` `overflow-hidden min-w-0 line-clamp-2`, `Filtros.jsx:1` `grid grid-cols-2 sm:flex`, `Buscar.jsx:17` `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.

### Fase 3 — Seguridad (DoD-5 OWASP)
- `backend/app/core/config.py:14` `SECRET_KEY >=32` + `ENV=prod` check, `CORS_ORIGINS` env `cors_origins_list`.
- `backend/app/main.py:19` `CORSMiddleware` sin `"*"` (solo `GET/POST/PUT/PATCH/DELETE/OPTIONS`, `Authorization,Content-Type`), headers `nosniff/DENY`.
- `backend/app/core/security.py:25` `get_current_user` split/strip/lower `bearer` + mock solo `USE_MOCK_FALLBACK && ENV!=prod`.
- `backend/app/routers/publicaciones.py:228` `Query(ge/le/max_length)` + servicios max 10, `Path(ge=1)`.

### Fase 4 — HU-005 Publicar funcional (URLs)
- `frontend/src/pages/Publicar.jsx:1` 321 líneas: login `POST /api/auth/login` (demo `arrendador@alojau.com/AlojaU123` o `mock-token-arrendador`), validación `titulo 10-150/descripcion 20-2000/tipo/canon>0/zona/dirección 10+/reglas 10+/lat/lon/servicios[]/campus[]/fotos 3-10 HttpUrl`, `POST /api/publicaciones` Bearer → `PENDIENTE` + `indice/desglose`, `Detalle.jsx:12` banner PENDIENTE oculta WhatsApp si `!isActivo`.

### Fase 5 — Pruebas automatizadas (no IA)
- **Backend 44→47** (`PYTHONPATH=backend pytest -q`): `test_haversine 3`, `test_trust 3`, `test_api 6`, `test_hu_sprint1 16+3`, `test_security 16`.
- **Frontend 30→38** (`npm run test:run`): `formatters 9`, `Card 10`, `Filtros 5`, `IndiceConfianza 6`, `Paginacion 8`, `vite.config.js:6` `jsdom`.
- `vite build` 483→492kB, `oxlint` solo warnings `setState in effect`, `py_compile` ok.

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

### Fase 8 — Despliegue $0 + Fix conexión Supabase (2026-09-02 01:00, commits d821299/004a47e/c2dde2e)
- `backend/Dockerfile:1` + `render.yaml:1` (Docker, plan free, `healthCheck /health`, `autoDeploy true`, env `DATABASE_URL`/`SECRET_KEY`/`CORS_ORIGINS`/`ENV=prod`) + `frontend/vercel.json:1` (Vite rewrites) + `frontend/.env.example:1` doc `VITE_API_URL` + `docs/DESPLIEGUE.md:1` guía $0.
- Fix `requirements.txt:11` `bcrypt==4.0.1` (pin) por `ValueError: password cannot be longer than 72 bytes` con `passlib+bcrypt 4.1+` en Render.
- Fix `session.py:11` `_normalize_supabase_url` (asegura `+asyncpg` y `ssl=require` si supabase) + `statement_cache_size=0` si `pgbouncer=true`, y `publicaciones.py:270` logs `logger.error("[DB fallback]")` para no ocultar `asyncpg` exception. `c2dde2e` pusheado, Render `Live` con 6 reales tras quitar `?pgbouncer=true` extra y usar `5432`.
- Verificado prod `https://aloja-u.vercel.app` 6 pubs + `https://alojau-api.onrender.com/health` 200 + CORS `allow-origin: https://aloja-u.vercel.app`.

### Fase 9 — Upload real + Galería + Visor (2026-09-02 01:30, commit feed76b) **[NUEVO]**
- **Modificado:** `backend/app/main.py:12` añade `StaticFiles /uploads` + `mount` y `include uploads.router`; `backend/requirements.txt:13` añade `python-multipart==0.0.9`; `frontend/src/pages/Publicar.jsx:10` reemplaza inputs URL por `<UploadFotos token onUrls>` + fallback `<details>` URLs; `frontend/src/pages/Detalle.jsx:6` reemplaza grid estático por `<GaleriaFotos fotos titulo>`; `.gitignore:14` añade `backend/uploads/`.
- **Creado:** `backend/app/routers/uploads.py:1` `POST /api/publicaciones/upload` (`prefix /api/publicaciones/upload`, solo `ARRENDADOR`, valida `3-10` files, `5MB` c/u, `image/*` con ext fallback, `uuid.hex + ext` seguro, `await file.read()`, guarda `backend/uploads/`, retorna `{"urls": ["{base}/uploads/{uuid}.jpg"], "count": n}`); `backend/uploads/` dir; `frontend/src/components/UploadFotos.jsx:1` (drag-drop `onDrop`, `URL.createObjectURL` previews, valida tipo/tamaño, `POST` con `Bearer` + `multipart/form-data`, muestra `✓ Subidas N URLs`, `Limpiar` revoca URLs); `frontend/src/components/GaleriaFotos.jsx:1` (responsive: mobile 1 + `+N` (`+3` para 4, `+9` para 10), desktop 4 + `+N` (`+6` para 10), badge `N fotos`, `onClick` abre visor); `frontend/src/components/VisorFotos.jsx:1` (fixed `bg-black/90`, `ESC`/`←`/`→`, `index/total`, `Abrir original`/`Descargar`, thumbs, `body overflow hidden`).
- **Qué hace:** arrendador arrastra 3-10 fotos en Publicar → `Subir → obtener URLs` → `Enviar a PENDIENTE` usa esas URLs; en Detalle, fotos ya no son estáticas: mobile cabe 1 + `+3`, desktop 4 + `+6`, click abre visor iterativo con prev/next, contador, thumbs y descarga. En Render Free los archivos son efímeros (se borran al redeploy) — documentado para prod usar Cloudinary/Supabase Storage.
- **Verificado:** `curl` upload 3 ok 200, 2→422, 11→422, txt→400, >5MB→413, sin auth 401; `pytest 47` `vitest 38` `vite build 492kB`; MCP Firefox: `Detalle/1` 4 fotos desktop/mobile + visor `2/10` navegación ok, `Publicar` drop zone `0/10` + `Subidas 3 URLs`, `Detalle/51` 10 fotos `+6` desktop `+9` mobile + visor.

---

## 3) Gestión de seguridad (resumen)

| Capa | Medida | Archivo | Verificación |
|------|--------|---------|--------------|
| Auth | JWT HS256 8h + bcrypt 4.0.1, mock solo dev | `security.py:25` `config.py:14` `requirements.txt:11` | `test_security.py:12` 401/403 |
| Inyección | SQLAlchemy parametrizada, no f-string | `publicaciones.py:165` | `SQLi 422` |
| XSS | React escape, no `dangerouslySetInnerHTML` | `Card.jsx` | `XSS 201 sin exec` |
| CORS | Sin `*`, solo localhost/Vercel env | `main.py:19` `render.yaml:13` | `curl Origin` |
| Validación | Pydantic `Field(gt,min_length,HttpUrl)` + Query `ge/le` + Upload `image/*`/`5MB`/`3-10` | `schemas/publicacion.py:7` `publicaciones.py:228` `uploads.py:21` | `422/400/413` |
| Fotos | 3-10 `HttpUrl` (o upload uuid), `StaticFiles /uploads` | `Publicar.jsx:10` `uploads.py:1` `main.py:12` | `curl /upload` |
| Storage | localStorage solo ids, validado, max 50/3, no PII | `FavoritosContext.jsx:8` | manual |

---

## 4) Pruebas unitarias (detalle actualizado)

**Backend 47 passed** (`PYTHONPATH=/home/angel/Escritorio/AlojaU/backend python3 -m pytest -q` necesita PG):
- `test_haversine.py:1` 3 (0m, Tulcán-Pandiguando 400-600m), `test_trust.py:1` 3 (100/0, bug reportes PENDIENTE/CONFIRMADO), `test_api.py:1` 6 (health/campus/filtro 400/401/paginado), `test_hu_sprint1.py:1` 19 (HU-001 C1-3, HU-002 C1-3, HU-003 C1/C3, HU-005 C1-3, HU-007, HU-008 + 3 paginación), `test_security.py:1` 16 (CORS, headers, SQLi, XSS, servicios largo 400).
- *Upload real sin test automatizado aún (solo curl manual 3/422/400/413) — pendiente `test_upload.py`.*

**Frontend 38 passed** (`cd frontend && npm run test:run`):
- `formatters.test.js:1` 9 (COP, distancia, tiempo `80m/min`), `Card.test.jsx:1` 10 (overflow, fotos array/número, truncate), `Filtros.test.jsx:1` 5 (responsive, multi-checkbox), `IndiceConfianza.test.jsx:1` 6, `Paginacion.test.jsx:1` 8 (1 página/ellipsis/disabled). `vite.config.js:6` `jsdom` + `src/test/setup.js:1` `jest-dom`.
- *Galería/Visor/Upload sin test aún — pendiente `UploadFotos.test.jsx`/`Galeria.test.jsx`.*

**Histórico:** 0 → 47+38=85 tests. `npm run build` 492kB, `npm run lint` solo warnings `setState in effect`, `npm audit 0`.

---

## 5) Estado actual exacto (para retomar sin alucinar)

**Git:**
- `main` en `feed76b` (pusheado a `origin/main`), `origin/develop` y 6 `feature/HU-*`. Último commit: `feat(HU-005): upload real 3-10 imgs + galería +10/+3 y visor iterativo` (9 files, 414 insert). `git status` limpio. `git show 9972c3f..feed76b --stat` muestra upload+galería.

**DB:**
- Local `alojau` PG16 `alojau_db:5432` y Supabase `mwxkzz...` (us-east-2 pooler 5432) ambos con 6 ACTIVO (IDs 1-6 Tulcán/Centro/Pandiguando) y 20 imgs Unsplash, `publicaciones_id_seq=6` (test 10 fotos ID 51 limpiado), `backend/uploads/` vacío (ephemeral) y `.gitignore`.

**Servicios:**
- Local `uvicorn app.main:app --host 0.0.0.0 --port 8000` (sin --reload, PID 192999) + `vite --host 0.0.0.0 --port 5173` (PID 35261). Prod `https://alojau-api.onrender.com` (Docker, `health` 200, 6 reales) + `https://aloja-u.vercel.app` (Vercel, `VITE_API_URL`).
- Si no están: `docker-compose up -d && cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000` + `cd frontend && npm run dev`.

**Puntos críticos:**
- `models/__init__.py:91` `secondary="publicacion_servicios"`; `publicacion_id` no `pub_id`.
- `MOCK_PUBS` usa `campus_ids`/`servicios_ids`, `max id 10000` para no colisionar.
- `Buscar.jsx:1` maneja ambos formatos (`Array.isArray(data)?...:data.items`) pero ahora siempre paginado.
- `Filtros.jsx:1` multi `servicios=1,3`, `UploadFotos.jsx:1` drag-drop, `GaleriaFotos.jsx:1` mobile 1+3 / desktop 4+6, `VisorFotos.jsx:1` ESC/←→.
- `Favoritos/Comparar` `localStorage` keys `alojau_favoritos`/`alojau_comparar`, validados.
- `uploads.py:1` solo ARRENDADOR, `StaticFiles /uploads` en `main.py:12`, `python-multipart` requerido.

---

## 6) Lo que queda importante por desarrollar (orden lógico)

**Hecho en sesiones 31-08 y 02-09 (no repetir):** paginación + filtros multi + favoritos/comparar + despliegue $0 + fix bcrypt/pgbouncer **+ upload real + galería +10/+3 y visor** (ver §2 Fase 6-9). Todos con `curl` y MCP verificados.

**Pendiente prioritaria (siguiente sprint, lento pero seguro):**

**1. Persistencia y tests de upload (prioridad 1, ~1 día):**
- **Tests:** crear `backend/tests/test_upload.py` (3 ok →200 + urls, 2→422, 11→422, txt→400, >5MB→413, sin auth 401) y `frontend/src/components/UploadFotos.test.jsx` + `GaleriaFotos.test.jsx` (responsive +N, visor ESC). Subirá de 47→50 backend y 38→42 frontend.
- **Persistencia prod:** Render Free borra `backend/uploads/` al redeploy. Cambiar `uploads.py:1` para si `CLOUDINARY_URL` o `SUPABASE_STORAGE` env existe, subir a Cloudinary (`cloudinary.uploader.upload`) o Supabase Storage (`supabase.storage.from('fotos').upload`) y retornar `secure_url` en vez de `/{uuid}.jpg`. Añadir `cloudinary==1.40.0` o `supabase==2.8.0` a `requirements.txt` solo si se usa. Mientras, documentar en `Publicar.jsx` que es efímero.

**2. QA / código limpio (0.5 día):**
- Refactor `publicaciones.py:_query_db_lista` (80 líneas, N+1 reportes): extraer `get_distancia(p,campus_id)` y `build_trust(p, usuario, reportes)` + paginación con `LIMIT/OFFSET` en SQL cuando >100 (ahora en memoria ok para 6).
- `Publicar.jsx` 321→ extraer `usePublicarForm` hook + `LoginForm` componente.
- Añadir `ruff`/`mypy` backend y `eslint` reglas, `pre-commit` para no subir `.env`.

**3. Pulir diferenciación (opcional, ya base está):**
- Vigencia badge mejorado en `Card.jsx:1` (mostrar `D-12` si `fecha_expiracion` <7d).
- `Comparar` ya tabla 2-3, pero añadir `export CSV` o `share` para demo.

**No hacer en Sprint1** (Tabla23:34): HU-006 Renovar, HU-010 Moderación, Pagos, Chat, IA matching.

---

## 7) Cómo proceder en nuevo chat (paso a paso, sin desalinearse)

1. **Nuevo chat:** pega `Lee docs/HISTORICO_Y_CONTEXTO.md §0-§5 y docs/SCRUM_Y_QA.md §4.2` + `git status` + `git log --oneline -5`.
2. **Verifica entorno:** `docker-compose ps; curl -s http://localhost:8000/health | jq; curl -s "http://localhost:8000/api/publicaciones?campus_id=1&page=1&size=3" | jq '{total,pages,items:(.items|length)}'; PYTHONPATH=backend pytest -q; cd frontend && npm run test:run && npm run build`
3. **Siguiente feature:** elige **§6.1 tests+Cloudinary** → rama `feature/upload-persist` desde `develop` (o `main` si hotfix), implementa `cloudinary` + `test_upload.py`, `npm run test:run`, `git commit -m "feat(upload): persist Cloudinary + tests"` + captura mobile/desktop galería 10.
4. **QA:** refactor `_query_db_lista`, `git commit -m "refactor(publicaciones): extraer trust/distancia"`.
5. **Push:** `git push origin main` (o PR `develop→main` según `SCRUM_Y_QA.md:90`). Prod auto-deploy en 2-4 min.

> **Regla de oro PDF p34:** no prometer pagos/chat/IA ni tiempo ruteado; solo Haversine + disclaimer `Informativo, no garantiza seguridad.`.

---

## 8) Comandos de verificación rápida (copy-paste)

```bash
# infra
docker-compose ps; curl -s http://localhost:8000/health | jq; curl -s http://localhost:5173 | head
# backend 47 tests + upload manual
PYTHONPATH=/home/angel/Escritorio/AlojaU/backend python3 -m pytest -q
curl -s -X POST http://localhost:8000/api/publicaciones/upload -F files=@/tmp/a.jpg -F files=@/tmp/b.jpg -F files=@/tmp/c.jpg -H "Authorization: Bearer mock-token-arrendador" | jq
# frontend 38 tests + build
cd frontend && npm run test:run && npm run build && npm run lint
# paginación + filtros + upload 10
curl -s "http://localhost:8000/api/publicaciones?campus_id=1&page=1&size=2" | jq '{total,pages,items:(.items|length),ids:[.items[].id]}'
curl -s "http://localhost:8000/api/publicaciones?campus_id=1&tipo=APARTAESTUDIO&servicios=1&page=1&size=9" | jq '[.items[]|{id,tipo,servicios_ids}]'
curl -s http://localhost:8000/api/publicaciones/51 | jq '.fotos | length' # 10 si existe test 10
curl -s https://alojau-api.onrender.com/api/publicaciones?campus_id=1 | jq '.total' # 6 prod
# seguridad
curl -s -I -H "Origin: http://localhost:5173" http://localhost:8000/health | grep -i access-control
curl -s "http://localhost:8000/api/publicaciones?campus_id=1; DROP" | head
```

---

## 9) Bitácora de sesión

| Fecha | Qué se hizo | Validación |
|-------|-------------|------------|
| 2026-08-31 08:50 | Corregidos 7 tests fallidos por paginado (`_items()` + 3 nuevos) → 47 backend | `pytest -q` 47 passed |
| 2026-08-31 08:50 | Filtros multi 5 servicios + Paginación URL state + debounce | `vitest 38 passed`, capturas 1280/500 |
| 2026-08-31 08:50 | Favoritos/Comparar localStorage (validados, max 50/3, sin PII) + Card/Detalle/Comparar UI | MCP Firefox: Buscar, Detalle Leaflet, Comparar 2/3 tabla, nav badges |
| 2026-09-02 01:00 | Deploy $0 (Vercel+Render+Supabase) + fix bcrypt 4.0.1 + pgbouncer/ssl | Prod 6 reales, `curl` health 200, CORS ok |
| 2026-09-02 01:30 | **Upload real 3-10** (`uploads.py` + `UploadFotos` drag-drop) + **Galería +10/+3** + **Visor** (ESC/←→, counter, thumbs) | `curl` upload 3→200, 2→422, txt→400, >5MB→413; `pytest 47` `vitest 38` `build 492kB`; MCP: `Detalle/1` 4 desktop/mobile, `Detalle/51` 10 `+6`/`+9` + visor `2/10`, `Publicar` drop zone |

*Próximo: tests upload + persistencia Cloudinary/Supabase Storage + refactor trust/distancia. Repo en `feed76b` pusheado a `origin/main`, prod `https://aloja-u.vercel.app` + `https://alojau-api.onrender.com` con 6 reales.*
