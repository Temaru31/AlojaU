# AlojaU — Histórico de Implementación y Contexto para Nuevo Chat
> **No borrar:** este documento es el historial real de lo ejecutado y el punto de partida para el siguiente chat / sprint. Creado 2026-08-31 02:15 (UTC-5). Actualizado 2026-08-31 08:50 (UTC-5). Ramas: `main` en `c9f674b` (pusheado) y `fee7cc7` (pusheado). Estado actual: **paginación COMPLETADA + filtros multi + favoritos/comparar implementados** (ver §6-9). Tests: backend 47 passed, frontend 38 passed, build ok. Pendiente commit/push.

---

## 1) Resumen ejecutivo (qué se hizo)

**Objetivo:** pasar de esqueleto 40% a MVP demoable `Buscar → Filtrar → Entender → Confiar → Contactar` + `Publicar PENDIENTE` con UX agradable desde día 1, sin depender de IA (pruebas automatizadas).

**Entregado y pusheado:**
- **Backend:** `GET /health`, `GET /api/campus`, `GET /api/publicaciones?campus_id&precio&tipo&servicios`, `GET /api/publicaciones/{id}`, `POST /api/publicaciones` (PENDIENTE), `POST /api/auth/login` con JWT HS256 8h.
- **Frontend:** `Buscar` con filtros, `Detalle` con fotos, servicios, `Índice de confianza`, `MapaZona` Leaflet, `Publicar` funcional con login ARRENDADOR, `Card` sin overflow.
- **Seguridad + pruebas + UX** pulidos y validados con capturas Firefox.

**En curso (sin commit):** paginación `page/size` + `Paginacion.jsx` + `Buscar` con `useSearchParams` y debounce, aún no probada contra tests viejos (rompe compatibilidad array vs paginado).

---

## 2) Histórico por fases (con archivos:línea)

### Fase 0 — Arranque (ya existía)
- `docker-compose.yml:2` PG16 + pgAdmin, `backend/.env.example:2` `DATABASE_URL`, `frontend/vite.config.js:5` proxy `/api`.

### Fase 1 — DB real con 6 pubs (fix crítico)
**Problema:** API devolvía 2 (mock `publicaciones.py:33` MOCK_PUBS) en vez de 6 del `seed.sql:30`.
**Causa:** `app/routers/publicaciones.py:144` `from app.models.publicacion import Publicacion` → solo `Ciudad/Zona/Campus` (`models/publicacion.py:7`). Faltaban `relationship` para `selectinload(Publicacion.imagenes/servicios)` y `pub_id` vs `publicacion_id` (`models/__init__.py:147`).

**Fix:**
- `backend/app/models/__init__.py:91` añadido a `Publicacion` `zona/usuario/servicios(imagenes)/campus_links` con `relationship(secondary="publicacion_servicios", lazy="selectin")`, `PublicacionServicio:147` `pub_id→publicacion_id`, `PublicacionCampus:160` igual + `publicacion` back_populates, `ImagenPublicacion:179` back_populates, `PublicacionesAudit:202` alineado a `schema.sql:119` (`usuario_id/detalle`), eliminadas columnas extra `creado_en` en `Ciudad:23`, `ZonaBarrio:42`, `Campus:64`, `activo` en `ServicioCatalogo:140`, etc.
- `backend/app/models/publicacion.py:1` re-exporta desde `__init__.py` para compat `PublicacionAudit`.
- `backend/app/routers/publicaciones.py:144,163,185,283,351,378` import `from app.models`, `publicacion_id`, zona `p.zona.nombre`, `mock_id` 10000+ para evitar colisión DB 1-6.
- Verificación: `curl /api/publicaciones →6` (111/157/176/434/712/780m), `pytest` con `PYTHONPATH=backend`.

### Fase 2 — Fotos, confianza, tiempo, responsive
- **Fotos:** `seed.sql:62` 20 imágenes cloudinary 404 + `picsum 522` → Unsplash `images.unsplash.com/photo-...?w=600` (verificado `curl -I 200`). `Card.jsx:12` fallback `unsplash`, overlay `4 fotos`, `Detalle.jsx:39` grid 2/3 con fallback, `Publicar.jsx:41` default unsplash. Captura Buscar muestra 3 salas reales.
- **Confianza:** `IndiceConfianza.jsx:1` antes lista técnica 40/20/15/15/10. Ahora friendly: círculo 100/100, `¡Se ve bien!` / `Bastante bien` / `Revisa con calma`, barra `width: indice%`, botón `Ver por qué ▼` desplegable con 5 factores friendly (`Información completa 40/40`, `WhatsApp verificado 20/20`...), disclaimer. Test 6 passed.
- **Tiempo caminando:** `utils/formatters.js:6` `formatTiempoCaminando(m)=~Math.round(m/80) min a pie` (80m/min=4.8km/h realista, sin ruteo inventado), `formatDistanciaConTiempo`. `Card.jsx:10` `111m • ~1 min a pie • Tulcán`, `Detalle.jsx:23` `111m • ~1 min`, `MapaZona.jsx:18` `111m • ~1 min (80m/min sin ruteo)`.
- **Responsive/overflow:** `Card.jsx:11` `rounded-xl overflow-hidden min-w-0 line-clamp-2 break-words`, `Filtros.jsx:1` `grid grid-cols-2 sm:flex`, `Buscar.jsx:17` `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, `Detalle.jsx:22` `break-words`, `App.jsx:13` nav `min-w-0 truncate`, `index.css:8` `line-clamp-2`.

### Fase 3 — Seguridad (DoD-5 OWASP)
- `backend/app/core/config.py:14` `SECRET_KEY` validator `>=32` y `ENV=prod` check, `CORS_ORIGINS` env `CORS_ORIGINS=http://localhost:5173,http://localhost:3000` con `cors_origins_list`.
- `backend/app/main.py:19` `CORSMiddleware` sin `"*"` (antes `["*"]` con `credentials True` → inseguro), solo `GET/POST/PUT/PATCH/DELETE/OPTIONS` y `Authorization,Content-Type`, middleware `security_headers` `nosniff/DENY`.
- `backend/app/core/security.py:25` `get_current_user` parse robusto `split` + `strip` + `len==2` + `lower=="bearer"` + mock solo `USE_MOCK_FALLBACK && ENV!=prod`.
- `backend/app/routers/publicaciones.py:228` `Query(ge=1,le=1000, max_length=50)` + validación `servicios` max 10 y `1..1000`, `Path(ge=1)`.
- `curl -H Origin:http://localhost:5173 -I /health` → `allow-origin: http://localhost:5173` (no `*`), `X-Content-Type-Options: nosniff`.

### Fase 4 — HU-005 Publicar funcional
- `frontend/src/pages/Publicar.jsx:1` de dummy 20 líneas a 321 líneas funcional: login `POST /api/auth/login` (demo `arrendador@alojau.com/AlojaU123` o `mock-token-arrendador`), campos `titulo 10-150/descripcion 20-2000/tipo/canon>0/zona/dirección 10+/reglas 10+/lat/lon/servicios[]/campus[]/fotos 3-10 HttpUrl`, validación inline, `POST /api/publicaciones` con `Bearer`, estados `PENDIENTE` con `indice_confianza/desglose`, `Detalle.jsx:12` banner `No disponible — PENDIENTE (HU-003 C3)` y oculta WhatsApp si `!isActivo`.

### Fase 5 — Pruebas automatizadas (no IA)
- **Backend 44 passed** (`PYTHONPATH=backend pytest -q`): `test_api.py:4` (6), `test_hu_sprint1.py:1` (16 Gherkin HU-001 C1-3, HU-002 C1-3, HU-003 C1/C3, HU-005 C1-3, HU-007, HU-008) + `test_security.py:1` (16 CORS, headers, SQLi `campus_id=1; DROP`→422, XSS `<script>`→201 sin exec, servicios largo 400).
- **Frontend 30 passed** (`npm run test:run`): `Card.test.jsx:1` (10 overflow, fotos array vs número, truncate), `Filtros.test.jsx:1` (5), `formatters.test.js:1` (9 con `formatTiempoCaminando`), `IndiceConfianza.test.jsx:1` (6 desplegable), `vite.config.js:6` `test{environment:jsdom}`.
- `vite build` 466kB ok, `oxlint` solo 2 warnings `setState in effect` (fetch), `npm audit 0`, `py_compile` ok.

### Fase 6 — Paginación (COMPLETADA 2026-08-31 08:50)
- `backend/app/core/pagination.py:1` helper `paginate_params/build_paginated` con validación y cálculo `pages=(total+size-1)//size`.
- `backend/app/routers/publicaciones.py:130` `_query_db_lista` ahora `page,size` y paginación en memoria `out[offset:offset+size]`, endpoint `list_publicaciones:229` con `page=1,size=9` (Query ge/le), mock también paginado. Maneja `total/pages` y `X-Total-Count` ready.
- `frontend/src/components/Paginacion.jsx:1` componente con `prev/next` y 5 números, `Buscar.jsx:1` con `useSearchParams` + `page/size` + debounce 400ms + URL state + `Paginacion` UI. `Buscar` maneja ambos formatos (`Array.isArray(data)?...: data.items`) para compatibilidad.
- `backend/tests/test_api.py:1` y `test_hu_sprint1.py:36` actualizados con helper `_items()` para soportar paginado `{items,total,pages}` + 3 tests nuevos `test_paginacion_*` (47 passed total).
- `frontend/src/components/Paginacion.test.jsx:1` 8 tests + `Filtros.jsx:1` mejorado a multi-checkbox 5 servicios (1..5) con `toggleServicio` y validación rango inválido inline. Frontend `38 passed` (antes 30) + `vite build` ok.

### Fase 7 — Diferenciación AlojaU (NUEVO 2026-08-31 08:50, sin commit)
- `frontend/src/contexts/FavoritosContext.jsx:1` y `CompararContext.jsx:1` con `localStorage` validado (`parseStored` filtra ids 1..1M, max 50 favs / 3 comparar), `storage` sync entre pestañas, fallback seguro para tests sin provider, sin datos sensibles.
- `frontend/src/components/Card.jsx:1` ahora con botones corazón `♥/♡` y comparar `✓/+` overlay (stopPropagation, aria-pressed, backdrop-blur), `App.jsx:12` con `FavoritosProvider/CompararProvider` y badges `2/3` y `♡ 2` en nav.
- `frontend/src/pages/Comparar.jsx:1` tabla 2-3 con matriz `canon/depósito/tipo/zona/distancia/tiempo/índice/servicios/fotos/dirección` y `No informado` si falta, fetch paralelo 2-3 pubs, `Detalle.jsx:12` con botones favoritos/comparar y error inline si >3.
- Verificado con capturas MCP Firefox: Buscar 1280 (3 cols) y 500 (1 col responsive), Detalle con mapa Leaflet y WhatsApp, Comparar 2/3 con tabla, filtros combinados `tipo=APARTAESTUDIO` (2 resultados) y `servicios=1,4` (2 resultados). Seguridad CORS/headers/SQLi/XSS verificados con `curl`.

---

## 3) Gestión de seguridad (resumen)

| Capa | Medida | Archivo | Verificación |
|------|--------|---------|--------------|
| Auth | JWT HS256 8h + bcrypt, mock solo dev | `security.py:25` `config.py:14` | `test_security.py:12` 401/403 |
| Inyección | SQLAlchemy parametrizada, no f-string SQL | `publicaciones.py:165` | `SQLi 422` |
| XSS | React escape + backend no `dangerouslySetInnerHTML` | `Card.jsx` | `XSS 201 sin exec` |
| CORS | Sin `*`, solo localhost/Vercel env | `main.py:19` | `curl Origin` |
| Validación | Pydantic `Field(gt,min_length,HttpUrl)` + Query `ge/le/max_length` | `schemas/publicacion.py:7` `publicaciones.py:228` | `422` |
| Fotos | 3-10 `HttpUrl`, 5MB, `image/*` (frontend `accept`), storage local/Cloudinary | `Publicar.jsx:41` | manual |

---

## 4) Pruebas unitarias (detalle)

**Backend 44:**
- `test_haversine.py` 3, `test_trust.py` 3, `test_api.py` 6 (health/campus/filtro 400/401), `test_hu_sprint1.py` 16 (Gherkin), `test_security.py` 16 (CORS, headers, auth, inyección).
- Comando: `PYTHONPATH=/home/angel/Escritorio/AlojaU/backend python3 -m pytest -q` (necesita `DATABASE_URL` y PG arriba).

**Frontend 30:**
- `formatters.test.js` 9 (COP, distancia, tiempo caminando `80m/min`), `Card.test.jsx` 10 (overflow, fotos array, truncate), `Filtros.test.jsx` 5, `IndiceConfianza.test.jsx` 6 (friendly + desplegable). Config `vite.config.js:6` + `src/test/setup.js:1` `jest-dom`.
- Comando: `npm run test:run` en `frontend`, `npm run build` para prod, `npm run lint` (oxlint).

Históricamente sin pruebas → ahora 74 tests automatizados para no depender de IA.

---

## 5) Estado actual exacto (para retomar sin alucinar)

**Git:**
- `main` en `fee7cc7` pusheado a `origin/main` (`Temaru31/AlojaU`). Último commit `feat(UX): fotos reales Unsplash + confianza...` (11 archivos).
- **Pendiente sin commit:** paginación (ver §6). `git status` muestra 11 modificados: `backend/db/seed.sql` (ya estaba), `backend/app/core/pagination.py` (nuevo no trackeado), `backend/app/routers/publicaciones.py`, `frontend/src/pages/Buscar.jsx`, `frontend/src/components/Paginacion.jsx` (nuevo), `frontend/src/utils/formatters.js` (ya), etc. Hacer `git add` + `git diff --stat`.

**DB:**
- `alojau` PG16 con 6 ACTIVO (IDs 1-6, Tulcán/Centro/Pandiguando) y 20 imágenes Unsplash, `publicaciones_id_seq` en 6, sin PENDIENTE de test (limpiado `DELETE WHERE estado='PENDIENTE' AND id>6`).

**Servicios corriendo (si los levantaste al inicio):**
- `docker-compose.yml:2` `alojau_db:5432` + `alojau_pgadmin:5050` (o Supabase), `uvicorn app.main:app --reload --port 8000` (PID 34479), `vite --host 0.0.0.0 --port 5173` (PID 35261). Si no están, `docker-compose up -d && cd backend && uvicorn app.main:app --reload --port 8000` + `cd frontend && npm run dev`.

**Puntos críticos recordados:**
- `models/__init__.py:91` relaciones con `secondary="publicacion_servicios"`; `publicacion_id` no `pub_id`.
- `MOCK_PUBS` usa `campus_ids`/`servicios_ids`, `max id 10000` para no colisionar.
- Frontend `Buscar` ya maneja paginado `Array.isArray(data)?...` pero tests viejos no.

---

## 6) Lo que queda importante por desarrollar (orden lógico, código limpio)

**1. Terminar paginación + filtros combinados (lo que mencionaste como prioridad 1):**
   - Backend: ya acepta `page/size`, pero falta test para total/pages y manejo de `X-Total-Count` si se quiere header. Añadir `test_paginacion` en `test_hu_sprint1.py`.
   - Frontend: `Buscar.jsx` ya tiene `useSearchParams` + debounce, pero `Filtros.jsx` solo maneja `WiFi` (servicios='1'); falta multi-checkbox para 5 servicios (1..5) y `tipo` single. Hacer `Filtros` con `servicios_ids: number[]` → `servicios=1,3` query. Añadir `Paginacion.test.jsx` y actualizar `test_api` para esperar paginado.

**2. Subida real de fotos (prioridad 1):**
   - Backend: crear `POST /api/publicaciones/upload` con `UploadFile` multipart, validar `3-10` archivos, `max 5MB`, `content-type image/*`, guardar en `backend/uploads/{uuid}.jpg` (local) o Cloudinary si `CLOUDINARY_URL` env, retornar `{"urls": [...]}`. Añadir `StaticFiles` para servir `/uploads`.
   - Frontend: `Publicar.jsx` cambiar de 3 inputs URL a `<input type="file" multiple accept="image/*" onChange={handleFiles}>` con preview `URL.createObjectURL`, drag-drop, validación tamaño, botón `Subir` que llama a `/upload` y obtiene URLs, luego `POST /api/publicaciones` con esas URLs. Añadir test `Publicar.test.jsx` para validación 3 fotos.

**3. Diferenciación AlojaU (según PDF §4.1/4.4 y encuesta 57):**
   - PDF dice: **ninguna** competencia documenta para Popayán la combinación `habitación/aparta + filtro campus + costo desglosado + vigencia 30d + comparación + índice`. Diferenciación no es IA matching (Rentpana) ni pagos (Tayra) sino **local + confianza + vigencia**.
   - Lo ya potenciado: índice friendly + tiempo caminando `80m/min` + fotos reales.
   - Siguiente para diferenciar más tiempo: **Comparar HU-004** (hoy `Comparar.jsx:3` solo TODO): implementar bandeja `2/3` con `localStorage` + matriz `canon/depósito/servicios/distancia/índice` con `No informado`. **Favoritos HU-009** (localStorage, corazón en Card/Detalle). **Vigencia visible** en Card (`Vigencia 30d`). Estos son los que el PDF prioriza como oportunidad local.

**4. QA / código limpio (tu pedido):**
   - Refactor `publicaciones.py:_query_db_lista` (hoy 80 líneas con trust + reportes N+1); extraer `build_trust(p)` y `get_distancia(p,campus_id)`.
   - `Publicar.jsx` 321 líneas → extraer `usePublicarForm` hook y `LoginForm` componente.
   - Añadir `mypy`/`flake8` en backend y `eslint` reglas, y `pre-commit` para no subir `.env`.

---

## 7) Cómo proceder en nuevo chat (paso a paso, sin desalinearse)

1. **Nuevo chat:** pega `Lee docs/HISTORICO_Y_CONTEXTO.md y docs/SCRUM_Y_QA.md §4.2` + `git status` + `git diff --stat`.
2. **Verifica entorno:** `docker-compose ps`, `curl /health`, `curl "/api/publicaciones?campus_id=1&page=1&size=9" | jq .total`, `PYTHONPATH=backend pytest -q`, `npm run test:run`.
3. **Termina paginación:** actualiza `test_hu_sprint1.py` para esperar `items`, añade `Paginacion.test.jsx`, `git commit -m "feat(paginacion): URL state debounce + combinable"`.
4. **Foto real:** crea `backend/app/routers/uploads.py`, `POST /upload`, `frontend/src/components/UploadFotos.jsx`, test, `git commit`.
5. **Diferenciación:** implementa `Comparar` y `Favoritos`, test, captura Desktop 1280 + Mobile 375, `git commit`.
6. **Push:** `git push origin main` (o PR `develop→main` según `SCRUM_Y_QA.md:90`).

> **Regla de oro PDF p34:** no prometer pagos/chat/IA matching ni tiempo a pie ruteado; solo Haversine + disclaimer.

---

## 8) Comandos de verificación rápida (copy-paste)

```bash
# infra
docker-compose ps; curl -s http://localhost:8000/health | jq; curl -s http://localhost:5173 | head
# backend 74 tests (ahora 44, tras paginación serán 46)
PYTHONPATH=/home/angel/Escritorio/AlojaU/backend python3 -m pytest -q
# frontend 30 tests
cd frontend && npm run test:run && npm run build
# foto y paginación
curl -s "http://localhost:8000/api/publicaciones?campus_id=1&page=1&size=3" | jq '{total, pages, items: (.items|length)}'
curl -s -X POST http://localhost:8000/api/publicaciones/upload -F files=@/tmp/test.jpg -H "Authorization: Bearer mock-token-arrendador"
```

---

*Última actualización: 2026-08-31 08:50 tras completar paginación + filtros multi + favoritos/comparar (tests 47/38, build ok, capturas MCP verificadas). Si otro chat parte de cero, que lea este archivo y `main (2).pdf` §2.2/4.1/5.3/5.5. Próximo pendiente: subida real fotos `POST /upload` multipart 3-10 imágenes 5MB image/* y refactor `_query_db_lista` (extraer trust/distancia).* 

## 9) Actualización 2026-08-31 08:50 — Qué se hizo en esta sesión
- Corregidos tests backend para paginado (7 fallos → 0, +3 nuevos = 47).
- Filtros mejorado a 5 servicios multi-checkbox con validación y UI responsive.
- Paginación frontend con `useSearchParams`, debounce 400ms, URL state, `Paginacion.jsx` testeado.
- Favoritos/Comparar con localStorage seguro, contexto, UI en Card/Detalle/Comparar, verificado con MCP (Firefox 1280/500, mapa, WhatsApp).
- Build, lint, seguridad (CORS sin *, headers nosniff/DENY, validación Pydantic, SQL parametrizada, React escape) ok.
- Pendiente git commit/push (11+ archivos, ver `git status`).
