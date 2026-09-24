# AlojaU — Histórico de Implementación y Contexto para Nuevo Chat
> **No borrar:** historial real ejecutado y punto de partida para siguiente chat/sprint. Creado 2026-08-31 02:15 (UTC-5). Actualizado **2026-09-23** (UTC-5). Rama `main` con trabajo v13→v15.2 sin commitear (ver §5). Tests: **backend 268 passed + frontend 303 passed = 571** (ver bitácora 2026-09-23). DB local: seed v7 + migraciones hasta 011, limpia tras suites. Servicios locales: `uvicorn:8000` + `vite:5173` (ver §5).

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
- `main` con bloque v13→v15.2 **sin commitear ni pushear** (81 paths: auth empresarial, blindaje, ciclo de vida, remediación, marketplace). Último commit pusheado anterior: `feat(HU-005): upload real 3-10 imgs + galería` era `feed76b`. `git status` NO limpio a propósito hasta revisión. No hacer push sin orden explícita.

**DB:**
- Local `alojau` PG16 con seed v7 (16 pubs: 13 ACTIVO + 3 PAUSADO_POR_REPORTE) + migraciones aplicadas hasta **011** (`007 auth`, `008 soft-delete`, `009 perfil JSONB`, `010 FK cascade+secuencias`, `011 vistas+dedup`). Tras cada suite queda limpia (3 usuarios seed, 0 tmp). Supabase prod: migraciones 005/006 aplicadas; **pendientes 007→011** (ver bitácora 2026-09-23).

**Servicios:**
- Local `python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000` (logs `/tmp/opencode/uvicorn.log`) + `npm run dev -- --port 5173` (logs `/tmp/opencode/vite.log`). OJO: no usar `pkill -f "uvicorn app.main:app"` (mata la propia shell; verificar con `ps aux | grep "[u]vicorn"`). Tests: `pytest` 268 + `vitest` 303 + `build` OK (2026-09-23).
- Si no están: `cd backend && python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000` + `cd frontend && npm run dev`.

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
| 2026-09-09 | P1 T1 API reportes (POST anon 201 + 429 + GET/PATCH admin) + seed bcrypt fix | `pytest 85 passed` (11 T1), `vitest 55` |
| 2026-09-09 | P1 T1 F1/F2 frontend (ReportarModal + botón Detalle + AdminReportes + ruta + 5 tests) | `vitest 60 passed`, `build` OK, commit `73dc8f1` |
| 2026-09-09 | P1 T1 F3 Cloudinary (Strategy Local/Cloudinary + `storage.py` + refactor `uploads.py` + fix leaks UploadFotos + 7 BE + 6 FE tests) | `pytest 92 passed`, `vitest 66 passed`, `build` OK |
| 2026-09-09 | Merge `feature/T1-reportes` → `develop` (ff `d68faed`→`a0f0536`, 3 commits, 0 conflictos; resto de ramas sin commits únicos, sin cruce). App `0.1.0`, último release `v0.3.0` en `main`. Cloudinary ya en Render prod | `develop`: `pytest 92 passed`, `vitest 66 passed`, `build` OK; scan sin secretos (solo mocks en tests) |
| 2026-09-09 | UX integral (rama `feature/UX-mejoras`): scroll-top Detalle, reportar en cabecera + tarjeta contacto, confianza verde/naranja/rojo (sin amarillo), `GET /api/publicaciones/mias` + página Mis Publicaciones, AuthContext + navbar avatar (Mi Perfil/Mis Pubs/Cerrar), login demo verificado 200, limpieza ACTIVO/Haversine | `pytest 96 passed` (4 mias), `vitest 76 passed` (10 UX), `build` OK |
| 2026-09-09 | Fix 5 errores screenshots + auditoría UX (12 hallazgos, 11 código): causa raíz backend stale sep08 (sin /mias→422) + spam reportes T1 en pub1 (0/10 CORRECTO, se limpió; seed pub2 intacto). Sin Estado en Detalle/Comparar/MisPubs (Publicada/En revisión), retry /mias, token sync Perfil/Publicar, $0→No informado, Esc modal, flag cancelled, sin Favoritos muerto, Básico, a11y. Servidores reiniciados (uvicorn+vite frescos) | `pytest 96`, `vitest 79`, `build` OK, live: detalle/1 100/10-10, mias 200 |
| 2026-09-09 | Dueño+Perfil (rama `feature/DUENO-perfil`): login prod diagnosticado (Supabase sin demo users / hashes viejos → SQL entregado), BD local limpia (320 PENDIENTE test → 6 seed), `/mias` paginado+estado, PATCH editar dueño (estado intacto, sin audit: sin evento EDITED), MisPubs paginación/filtro/modal editar, Perfil Mis-datos+stats, ScrollToTop global. Rigor: tests leen+restauran (no ensucian seed) | `pytest 102`, `vitest 83`, `build` OK, live: login→mias→PATCH→restore OK |
| 2026-09-10 | RBAC admin (rama `feature/RBAC-admin`): `seed_db.py` idempotente (passlib, UPSERT, SSL Supabase, [OK]), clave demo única AlojaU123 (mock+seed.sql alineados), router `/api/admin` (métricas, pendientes, aprobar/rechazar/pausar+audit, delete 204), alias `get_current_admin_user`, Perfil por rol (banner maestro + alertas), AdminDashboard + ProtectedAdminRoute + link navbar | `pytest 107` (5 RBAC), `vitest 90` (7 RBAC), `build` OK, live: admin JWT→métricas→aprobar→403 OK |
| 2026-09-10 | Seed Supabase prod ([OK], login prod 200 ambos roles) + T5 aislamiento (`backend/tests/conftest.py`: reseed seed por test + cierre sesión, guard anti-prod que aborta si supabase/ENV=prod). Por qué no savepoint/SQLite: documentado en el archivo | `pytest 107` en 35s, counts intactos (6/1/2), `vitest 90`, `build` OK |
| 2026-09-14 | Merge `feat/audit-smartsearch-filters-v2` → `main` (`--no-ff`, 0 conflictos): búsqueda tokenizada ES, filtros 2 niveles + bottom sheet móvil, multiciudad, perfil por pestañas, ajustes admin con caché, seed v7 (16 pubs: 13 ACTIVO + 3 PAUSADO_POR_REPORTE), migraciones 005/006 Supabase, campus opcional, comparador (miniaturas/CTAs/badge), mapa 1 pin vs trayectoria, peatonal 1.28/66 + OSRM, flexi-barrios | `pytest 172`, `vitest 207`, `build` OK; prod `https://aloja-u.vercel.app` verificada vía MCP |
| 2026-09-23 | **V13 Auth Empresarial**: `AuthService` desacoplado (local HS256 + Supabase JWKS), matriz scopes `permissions.py` (ESTUDIANTE base/ARRENDADOR/ADMIN + futuros), Google OAuth (`signInWithOAuth`, botón marca oficial, linking sin duplicados por email), registro Ley 1581 (consentimiento+IP+versión), OTP 6 dígitos/10min, recovery un solo uso/15min + fortaleza v13, rate-limit memoria+PG (bloqueo 15min), sesiones revocables, promoción ESTUDIANTE→ARRENDADOR al publicar, mig 007, `docs/AUTH_ENTERPRISE.md` | `pytest 202+16`, `vitest 282+9`, `build` OK; PG real local |
| 2026-09-23 | **V13.1 blindaje**: IP real tras proxy (`X-Forwarded-For` validada) para Ley 1581, fallback nombre Google <2 chars (nunca 422), soft-delete cuentas (gracia 30d + restore + purga admin + revive con Google), SDK `@supabase/supabase-js` + callback dual PKCE/implícito, danger zone en Perfil, mig 008 | `pytest 245`, `vitest 286`, `build` OK |
| 2026-09-23 | **V13.2 ciclo de vida + perfil marketplace**: democión N→0 solo por borrado explícito (`DELETE` dueño, `SELECT FOR UPDATE`), respuestas con `rol/rol_actualizado` + `refresh()` frontend, teléfono opcional (gate 400 al publicar, E.164 sin `+`), `preferencias` JSONB con namespaces (mig 009 + backfill placeholder→NULL), bio/foto (solo https), checklist progresiva + tags opt-in, onboarding sin fricción (email Google inmutable) | `pytest 252`, `vitest 293`, `build` OK |
| 2026-09-23 | **V14.0 auditoría read-only** (4 sub-agentes + bandit/oxlint/git): 0 secretos en código e historial, IDOR 0 casos, hallazgos ALTA (revocación 1/20 endpoints, fail-opens, OTP sin throttle, soft-delete en lecturas, FK sin CASCADE en DDL, secuencias seed) | `bandit` 0 high/2 med, `oxlint` 0 errores/58 warnings, informe en chat |
| 2026-09-23 | **V14.1 remediación**: revocación JTI central en `get_current_user` (prod 503 fail-closed, dev resiliente), fail-closed rate-limit con logging, throttle OTP (5/15min solicitar, 10/10min verificar), filtro `eliminado_en` en búsqueda/detalle/métricas, mig 010 (7 FK + `setval` seed), purga código muerto, `AuthContext` memoizado, `Authorization` en Detalle/Favoritos/Comparar | `pytest 257`, `vitest 292`, `build` OK |
| 2026-09-23 | **V15.2 marketplace**: `DetailOut` += `usuario_id/created_at/updated_at/vistas/imagenes[{id,url,orden}]`, `PATCH /{id}/estado` dueño (ACTIVO↔PAUSADO, 409 desde PENDIENTE), multimedia (`POST /upload/una`, `/vincular`, `DELETE /upload/{id}`, `PATCH /upload/orden` anti-UNIQUE), `GET /similares`, `POST /vista` (SHA256 IP+día + throttle), `auto_moderation.py` (reglas+heurística, flag OFF) + 9 settings + fix false-200, bulk approve/reject + `GET /auditoria`, mig 011 (vistas + dedup), `constants.js` + contadores + spinners, botón dueño + banner inactivo + fallback 404 con cortesía en Detalle, switch+vistas en MisPubs. Bug real corregido: token pre-promoción daba 403 en `/upload` (`require_arrendador` ahora valida rol en BD) | `pytest 268`, `vitest 303`, `build` OK; smoke local E2E (registro→OTP→publicar→democión→soft-delete→restore) + captura Brave |

*Próximo: commitear el bloque v13→v15.2 a `main` (81 paths, todo sin subir) + push. Aplicar en Supabase prod `009_profile_jsonb_preferences.sql`, `010_fk_cascade_and_sequences.sql` y `011_metrica_vistas.sql` (verificar `vistas_dedup` y FKs). Rotar secreto Google expuesto en chat + token Telegram. Configurar `TELEGRAM_CHAT_ID` (grupo dev) y `SUPABASE_URL` en Render + `VITE_*` en Vercel.*
| 2026-09-23 | **OAuth local + UX post-test**: `VITE_SUPABASE_URL` en `frontend/.env` y `SUPABASE_URL` en `backend/.env` (locales, sin trackear); botón Google siempre claro (dark-mode del SO lo invertía); `GET /oauth/google?redirect_to=` validado; fix volver-atrás desde Google (reset loading con `pageshow`/`visibilitychange`); flag `es_nuevo` en callback (login y registro Google son el mismo flujo: crea-o-vincula); settings admin por secciones (Publicaciones/Moderación/Visibilidad) + inputs por tipo; setting `vistas_visibles_publico=false` (solo dueño/admin, configurable); tabs MisPubs +Pausadas (no existe estado Borrador: PENDIENTE cumple ese rol); Perfil reestructurado en tarjetas (Cuenta/Contacto/Presentación) + Confianza explicativa con CTAs | `pytest 271`, `vitest 304`, `build` OK; OAuth local verificado E2E con MCP (navega a Google) |
| 2026-09-24 | **Fix portada + detalles 1-10 (anti-placebo E2E)**: BUG#1 `order_by(orden)` en relationship `Publicacion.imagenes` + orden defensivo en `build_card/build_detail` (`fotos[0]`=portada siempre); `mock_to_out` simula `imagenes[{id,url,orden}]` (ids `pub*1000+i`); mock fallback en `DELETE /upload/{id}`, `PATCH /upload/orden` y `POST /upload/vincular` (gestor sin PG); helper FE `utils/portada.js` (`portadaUrl/fotosOrdenadas`) usado en Card/Favoritos/Comparar/MisPubs/Detalle+Galería. Detalles: (1) bulk con `evaluar_democion` por dueño + `democionados[]`; (2) `validarPublicar(form,lim)` con `LIMITES`; (3) `GET /api/publicaciones/config-publica` + caché FE 5min (`diasDesactualizadaEfectiva` en Detalle); (4) `vistas` mock documentado (mias True, lista/similares False); (5) caché rol 60s en `require_arrendador`; (6) test fail-closed prod sin mock + `dev_token` solo dev; (7) `basicConfig(INFO)` en `main.py` dev; (8) CTA `/perfil#datos` (tab Datos y contacto); (9) `similares` excluye propio dueño (DB+mock); (10) `decode_token_provider_agnostic` cableado en `get_current_user`, CORS sin `PUT`, bcrypt directo (sin passlib) + seed/requirements | `pytest 284 passed +1 skipped`, `vitest 318 passed`, `build` OK; sin push a origin |
| 2026-09-24 | **Auditoría Lead Architect F1-F5**: F1 fetch origin — `origin/ramaDavid` trae 2 fixes no integrados (JWT 8h→2h `8bb0f93`, bloqueo HTML `6c18c5d`): conflicto seguro en `config.py`/`auth.py`/`schemas` al mergear (no se mergea aquí). F2-F4: 5 fixes — (a) `reglas_convivencia` BE 1000→2000 unificado con `LIMITES` (1500 chars ya no da 422); (b) Comparar con guardia `vivo` anti setState tardío; (c) Favoritos sin `window.confirm` (2 pasos "¿Confirmar limpieza?"); (d) MisPubs 401 con CTA "Volver a ingresar"→`/perfil`; (e) Upload con spinner + `aria-busy`; limpieza comentarios obsoletos (`Tarea/BUG-F3`) en schemas + UploadFotos. `.env.example` BE/FE verificados completos (sin cambios). RBAC/IDOR OK (404 no-ACTIVO salvo dueño/admin, mias por uid, uploads con dueño, admin con scope); paginación con tope 50 + `NullPool` en pytest + `async with` libera conexiones | `pytest 287 passed +1 skipped`, `vitest 322 passed`, `build` OK; sin push a origin |
| 2026-09-24 | **Integración ramaDavid en main local (sin pérdidas)**: merge `origin/ramaDavid` vía rama temporal (1 solo conflicto real en `auth.py`, resuelto quedándonos con login v13 y aplicando `expires_in_hours=settings` en los 7 retornos —mejor que el original que tocaba 3—; `configschemas/tests/SECURITY.md` fusionaron solos). Traído: JWT 8h→2h (`config` + `LoginOut` + `Legal.jsx` "2 horas" + `.env.example=2`) y bloqueo HTML `< >` en Create/Update coexistiendo con reglas-2000 (test de coexistencia 1500+`<script>`→422). Purga de 49 marcadores de tickets cerrados en fuente (se conservan generación `v13/v14/v15/OLA/Fase` y tests). Rama temporal eliminada | `pytest 293 passed +1 skipped`, `vitest 322 passed`, `build` OK; sin push a origin |
| 2026-09-24 | **M1-M7 sesión/UX/moderación (auditoría profunda)**: M1 `POST /auth/logout`+`/logout-all` (revocación con helper único, idempotentes) + `logout()` total (limpia `alojau_*`, revoca best-effort, `replace('/')`) + Nav por `user` verificado (fin fantasma). M2 `user_agent` en `SesionOut` + `utils/sesion.js` (fecha 12h Bogotá, "Chrome en Windows") + password oculta si Google + danger con email-match en vivo. M3 `canal` en OTP + mensajes por canal + cooldown 60s + `✓ Correo verificado`. M4 `servicios_ids`+`fotos` en Update y `PATCH /{id}/fotos`: el modal bufferiza todo y commitea en UN PATCH (helper `_reconciliar_fotos_urls` compartido); tags pre-poblados (constante `utils/servicios.js`). M5 `/publicar` sin form legacy (Google+Mi Perfil, retorno post-OAuth vía sessionStorage). M6 `?orden=` server-side en `/mias` + `⏸️/⚠️` en etiquetas. M7 toast cold-start a 3.5s. Doble auditoría (15 hallazgos previos + 12 estrictos, 9 aplicados). Flaky rate-limit entre archivos aislado en fixtures | `pytest 306 passed +1 skipped`, `vitest 348 passed`, `build` OK; sin push a origin |
| 2026-09-24 | **Panel admin + seguridad + responsive + historial (M1-M5)**: M1 `InfoTooltip` híbrido (hover/tap, Esc, click-fuera) + KPIs con `/metricas` (sin endpoint duplicado) + badge `[PENDIENTE]` veraz en auto-aprobar (setting sin consumidor). M2 oráculo reportes (mismo 404 ACTIVO/privado/inexistente) + pausar y revocar-todas en 2 pasos (revocar limpia sesión) + tags Perfil transaccionales. M3 áreas táctiles 44px (switch, ×, dots, tabs, menú) + Comparar conserva tabla con scroll/sticky (verificado, no cards) + spinner ReportarModal. M4 migración 012 (eventos SETTINGS/CUENTA_DELETE + audit.publicacion_id NULLABLE) + auditoría en settings/cuenta + pestaña Historial admin + `GET /{id}/historial` dueño. M5 anti-fricción verificado + contraste (gold solo sobre oscuro). Cazado por suites: decorador huérfano duplicaba `/similares`→historial (401 fantasma). Rechazos fundados: `/stats` duplicado, tabla `AuditLog` duplicada, Comparar→cards, badges de roadmap falso, SQLite en tests | `pytest 310 passed +1 skipped`, `vitest 360 passed`, `build` OK; sin push a origin |
