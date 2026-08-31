# AlojaU — Scrum + QA Sprint 1
> **Equipo 5 personas · Sprint 1 = 11 días · 20 SP / 37 h · WIP 2 · DoD 6 puntos + revisión cruzada · Rotación Tabla 27**
> Stack: `React 18 + Vite + Tailwind 3 + React Router + Leaflet + Axios` / `FastAPI + Uvicorn + Pydantic v2 + OpenAPI` / `PostgreSQL 16 + SQLAlchemy 2.0 async + asyncpg`
> Ramas: `main` (protegida) ← `develop` ← `feature/HU-00X`

Documento operativo listo para sustentación. Fuente única de verdad: este archivo + Trello + PRs.

---

## 1) Sprint 1 — Alcance comprometido

**Objetivo del Sprint 1:** *Entregar un incremento demostrable donde un estudiante busque publicaciones **ACTIVAS** por campus, filtre, consulte detalle con distancia Haversine y señales de confianza explicables, y contacte por WhatsApp; y un propietario autenticado pueda registrar una oferta estructurada que quede en `PENDIENTE` fuera del catálogo público.*

| HU | Entregable verificable | SP | H máx | Responsable Sprint 1 | Depende de |
|---|---|---:|---:|---|---|
| **HU-001** | Búsqueda y listado por campus (solo `ACTIVO` asociadas al campus) | **5** | 8 h | **Yeixon Julián Gembuel** | Catálogos + seed campus |
| **HU-002** | Filtros combinables precio / tipo / servicios | **3** | 7 h | **Yeixon Julián Gembuel** | HU-001 + catálogo servicios |
| **HU-003** | Ficha completa antes del contacto | **3** | 7 h | **Adrián Camilo Bergaño** | HU-001 |
| **HU-005** | Registro publicación estructurada → estado `PENDIENTE` (≥3 fotos) | **5** | 8 h | **Adrián Camilo Bergaño** | Auth arrendador + storage |
| **HU-007** | Índice de confianza 0-100 con desglose | **2** | 4 h | **Ángel David Caicedo** | HU-003 + datos confianza |
| **HU-008** | Contacto WhatsApp `wa.me` con referencia | **2** | 3 h | **Yeixon Julián Gembuel** | HU-003 + teléfono validado |
| | **TOTAL SPRINT 1** | **20** | **37** | | |

> `SP ≠ horas`. SP es complejidad relativa (Fibonacci 1-2-3-5-8, consenso equipo). Horas son estimación operativa. Ninguna HU >8 h (regla p.36); si excede, se divide.

**Listas Trello (obligatorio):** `Recursos y DoD` | `Product Backlog (10 HU)` | `Sprint Backlog Sprint 1 (6 HU)` | `En desarrollo` *(WIP=2)* | `En revisión / QA` | `Hecho` | `Bloqueado`

**Etiquetas:** Épica (`EPIC-001`…`EPIC-004`) + Prioridad (`Alta`/`Media`)

**Roles Sprint 1 (Tabla 27 rotación):**

| Rol | Sprint 1 |
|---|---|
| PO / Scrum Master | **Juan David Morán Santiusty** |
| Frontend / UX | **Yeixon Gembuel + José D. Arteaga** |
| Backend / Arquitectura-BD | **Adrián Bergaño** |
| DevOps / QA-Seguridad | **Ángel Caicedo** |

> Sprint 2-3-Final rotan según Tabla 27: cada integrante pasa por todos los roles. Cada HU mantiene **un responsable principal** en Trello, colaboradores en comentarios.

---

## 2) Definition of Done (DoD) — Checklist operativo para CADA PR

> **Una HU solo está HECHA si pasa los 6 puntos.** Quien codea **NO se auto-aprueba**. Se exige **revisión cruzada + QA manual** y evidencia en Trello.

### Cómo usarlo
Copia este checklist en cada PR (ya está en `.github/pull_request_template.md`). Marca `[x]` solo con evidencia (link, screenshot o comando). Si un punto no aplica, justifica con `N/A: motivo`.

#### ✅ DoD-1 · Código integrado y trazable
- [ ] Rama `feature/HU-00X-descripcion-corta` creada desde `develop` actualizada (`git pull`)
- [ ] Código en `develop` vía **PR**, no push directo a `main`/`develop`
- [ ] Commits atómicos con convención `tipo(HU-00X): mensaje` (`feat`/`fix`/`docs`/`chore`/`refactor`)
- [ ] Sin secretos en repo (`.env` en `.gitignore`), `npm run build` y `uvicorn app.main:app --reload` arrancan sin error
- [ ] OpenAPI `/docs` actualizado si hay endpoint nuevo

#### ✅ DoD-2 · Criterios Gherkin cumplidos (aceptación funcional)
- [ ] Los criterios `Dado/Cuando/Entonces` de la HU están **todos** verificados (ver §4 plan de pruebas)
- [ ] Validación **frontend + backend** (Pydantic) coherente — no solo HTML `required`
- [ ] Estados/máquina de estados respetada: `PENDIENTE` no aparece en catálogo, `ACTIVO` sí; `wa.me` solo si teléfono autorizado

#### ✅ DoD-3 · Evidencia móvil + escritorio
- [ ] **2 capturas adjuntas al PR:** `Desktop 1280px` + `Mobile 375px` (Chrome DevTools > Toggle device toolbar)
- [ ] Texto legible, sin overflow, botón WhatsApp accesible con pulgar, mapa/listado usable en móvil
- [ ] Ruta probada: `http://localhost:5173` y (si aplica) preview Vercel

#### ✅ DoD-4 · Test manual ejecutado y reproducible sin BD real
- [ ] Casos de §4 ejecutados con **datos de prueba §4.1** usando **mocks** (`backend/app/main.py` mock + `frontend/src/services/api.js`)
- [ ] Comandos de verificación pegados en PR: `curl` / pasos UI / `pytest -q` si aplica
- [ ] Sin regresión en HU previas del Sprint (smoke de 2 min por HU-001/002/003)

#### ✅ DoD-5 · Seguridad básica + validación
- [ ] Auth/autorización verificada: `HU-005` solo `ARRENDADOR`, moderación solo `ADMIN`; 401/403 testeados con y sin token
- [ ] Entradas sanitizadas: Pydantic `Field(gt=0, max_length, pattern)`, SQLAlchemy consultas parametrizadas (no f-strings SQL)
- [ ] CORS restringido (en prod solo Vercel), `wa.me` con `encodeURIComponent`, teléfono normalizado `57...` sin `+`
- [ ] Fotos: tipo `image/*` + tamaño máx, mínimo 3 validado en backend (no solo frontend)

#### ✅ DoD-6 · Trello + trazabilidad cerrada
- [ ] Tarjeta Trello movida a `En revisión/QA` → `Hecho` con **checklist** marcado, **responsable, SP, épica, evidencia y link al PR**
- [ ] Reviewer distinto al autor aprobó en GitHub (revisión cruzada)
- [ ] Si hubo uso de IA, fila añadida en bitácora §5 y **4 controles p.40** marcados en el PR

> **Bloqueo:** si fallas 1 punto, la tarjeta va a `Bloqueado` con comentario `Bloqueo: DoD-X motivo + dueño + fecha desbloqueo esperada`.

---

## 3) Flujo Git exacto para 5 personas — Comandos copy-paste

### 3.1 Principios
- `main` **protegida** (no push directo). Solo entra vía PR `develop → main` al final del Sprint + tag `v0.1-Sprint1`.
- `develop` es integración diaria. Cada HU es `feature/HU-00X-slug`.
- **WIP = 2** en `En desarrollo`: máximo 2 tarjetas/HU codificándose a la vez. Antes de tomar una 3ª, terminar o mover a `En revisión`.
- Historial limpio: **Squash and merge** en PRs. Commits semánticos.

### 3.2 Setup inicial (solo líder, una vez)

```bash
# 1) Crear repo en GitHub (web) vacío sin README, luego en local:
mkdir AlojaU && cd AlojaU
git init
git branch -M main
# añade README, .gitignore, docker-compose.yml, frontend/, backend/ (ver GUIA_Arranque)
git add .
git commit -m "chore: esqueleto inicial frontend+backend+docker"
git remote add origin https://github.com/<ORG>/AlojaU.git
git push -u origin main

# 2) Crear develop y ramas base Sprint 1
git checkout -b develop
git push -u origin develop

for hu in HU-001-buscar-campus HU-002-filtros HU-003-detalle HU-005-publicar HU-007-indice-confianza HU-008-whatsapp; do
  git checkout -b feature/$hu develop
  git push -u origin feature/$hu
done
git checkout develop

# 3) Proteger main (en GitHub Web: Settings → Branches → Add rule)
# Branch name: main
# ☑ Require a pull request before merging (Require approvals: 1)
# ☑ Dismiss stale pull request approvals when new commits are pushed
# ☑ Require status checks (si añades CI: build/test)
# ☑ Do not allow bypassing the above settings
# Repetir para develop con regla más laxa si quieres (1 approval recomendado).

# 4) Invitar equipo: Settings → Collaborators → Add people (4 correos)
```

### 3.3 Trabajo diario — cada integrante (copia/pega)

```bash
# 0) Clonar por primera vez
git clone https://github.com/<ORG>/AlojaU.git
cd AlojaU

# 1) Empezar/continuar tu HU (ej. HU-001)
git checkout develop
git pull origin develop
git checkout feature/HU-001-buscar-campus
git merge develop   # o git rebase develop (elige uno y manténganlo)

# 2) Codificar + commits pequeños
git status
git add frontend/src/pages/Buscar.jsx backend/app/routers/publicaciones.py
git commit -m "feat(HU-001): listado campus Tulcán + GET /api/publicaciones?campus_id"
# tipos: feat | fix | docs | chore | refactor | test

# 3) Subir y abrir PR hacia develop
git push -u origin feature/HU-001-buscar-campus
# Ve a GitHub → Compare & pull request → Base: develop ← Compare: feature/HU-001-buscar-campus
# Título: "feat(HU-001): buscar por campus (5SP/8h) - Yeixon"
# Body: pega checklist DoD §2 + Closes #<issue Trello si usas> + screenshots

# 4) Asignar reviewer (quien NO codeó la HU)
# GitHub PR → Reviewers → elige a Adrian o Angel (rotación)
# Reviewer deja 1 comentario + Approve o Request changes

# 5) Tras Approve, hacer Squash and merge en GitHub (botón verde → Squash and merge)
# En local, actualizar develop:
git checkout develop
git pull origin develop
git branch -d feature/HU-001-buscar-campus   # borra local (opcional)
git push origin --delete feature/HU-001-buscar-campus  # borra remoto tras merge (opcional)

# 6) Si te piden cambios:
git checkout feature/HU-001-buscar-campus
# ...corrige...
git commit -m "fix(HU-001): estado vacío informativo cuando 0 resultados (C2)"
git push
# El PR se actualiza solo. Vuelve a pedir review.
```

### 3.4 Comandos de emergencia

```bash
# Traer cambios de develop a tu feature sin líos
git checkout feature/HU-002-filtros
git fetch origin
git merge origin/develop
# resolver conflictos → git add <archivos> → git commit

# Deshacer último commit local no pusheado
git reset --soft HEAD~1

# Ver qué cambió antes de commitear
git diff
git diff --staged
git log --oneline -10
git status -sb

# Sincronizar si tu feature se quedó atrás
git pull --rebase origin develop
```

### 3.5 Convenciones obligatorias

- **Ramas:** `feature/HU-00X-slug-kebab` (ej. `feature/HU-005-publicar`). No `main-dev` ni `yeixon-fix`.
- **Commits:** `feat(HU-003): detalle muestra distancia Haversine` · `fix(HU-005): rechaza <3 fotos en backend`
- **PR título:** `feat(HU-007): índice confianza 0-100 con desglose (2SP/4h) — Angel`
- **No commitear:** `.env`, `node_modules/`, `venv/`, `pgdata/`, `.DS_Store`
- **Definition of Ready** antes de codificar: HU con criterios Gherkin + prototipo + dependencias claras.

---

## 4) Plan de pruebas Sprint 1 — Manual, sin BD real

### 4.0 Estrategia (por qué sin BD real funciona)

Sprint 1 no se bloquea esperando a BD. Se valida con **3 capas mock**:

1. **Backend mock** ya en `backend/app/main.py`: `GET /api/campus`, `GET /api/publicaciones?campus_id=&precio_min=&precio_max=`, `GET /api/publicaciones/{id}` devuelven JSON fijo (2 pubs ACTIVO). Cambia `mock` para simular casos borde.
2. **Frontend mock fallback** en `Buscar.jsx`/`Detalle.jsx`: si `api.get` falla, muestra datos locales.
3. **Fixtures JSON locales** para casos negativos: crea `frontend/src/mocks/fixtures.json` o edita inline el array `mock`.

> Para validar como si hubiera BD, basta ejecutar `uvicorn app.main:app --reload --port 8000` + `npm run dev` y usar `curl` + DevTools. No necesitas `docker compose up -d` para estos 6 HU (sí para Sprint 2).

### 4.1 Datos de prueba maestros (reutilizar en todas las HU)

```js
// Campus semilla (HU-001) — coordenadas reales Popayán validadas en Google Maps
campus = [
  {id:1, institucion:"Universidad del Cauca", nombre_sede:"Campus Tulcán", lat:2.4430, lng:-76.6060},
  {id:2, institucion:"Unicomfacauca", nombre_sede:"Claustro", lat:2.4410, lng:-76.6020},
  {id:3, institucion:"Cooperativa", nombre_sede:"Sede Centro", lat:2.4445, lng:-76.6130},
]

// Publicaciones mock (estado ACTIVO vs no-ACTIVO para HU-003)
pubs = [
  {id:1, titulo:"Habitación cerca Tulcán", canon:450000, deposito:200000, tipo:"HABITACION_INDEPENDIENTE", zona:"Pandiguando", lat:2.445, lng:-76.610, dist_m:320, estado:"ACTIVO", fotos:4, telefono_whatsapp:"573001234567", completitud:true, dias_vigencia:5, reportes:0},
  {id:2, titulo:"Apartaestudio amoblado", canon:700000, deposito:0, tipo:"APARTAESTUDIO", zona:"Centro", lat:2.446, lng:-76.612, dist_m:850, estado:"ACTIVO", fotos:3, telefono_whatsapp:"573001111111", completitud:true, dias_vigencia:28, reportes:0},
  {id:3, titulo:"Habitación PENDIENTE no visible", canon:380000, estado:"PENDIENTE", fotos:4, zona:"La Esmeralda"},
  {id:4, titulo:"Habitación RECHAZADA", canon:500000, estado:"RECHAZADO", fotos:3},
  {id:5, titulo:"Caso límite 1 foto", canon:300000, estado:"ACTIVO", fotos:1, telefono_whatsapp:"573009999999"},
  {id:6, titulo:"Sin teléfono", canon:400000, estado:"ACTIVO", fotos:4, telefono_whatsapp:null},
]

// Usuarios
arrendador = {email:"arriendo@popayan.co", rol:"ARRENDADOR", token:"fake-jwt-arrendador"}
estudiante = {email:"est@unicauca.edu.co", rol:"ESTUDIANTE"}
admin      = {email:"admin@alojau.com", rol:"ADMIN"}

// Haversine (p26)
R=6371000; d=2*R*asin(sqrt(sin²((lat2-lat1)/2)+cos(lat1)*cos(lat2)*sin²((lon2-lon1)/2)))
```

**Cómo inyectar datos sin BD:**

```bash
# Backend mock (curl directo)
curl -s http://localhost:8000/api/campus | jq
curl -s "http://localhost:8000/api/publicaciones?campus_id=1&precio_min=400000&precio_max=600000" | jq
curl -s http://localhost:8000/api/publicaciones/1 | jq

# Alternativa: edita backend/app/main.py -> mock = [...] para forzar estado PENDIENTE/RECHAZADO
# y reinicia uvicorn (--reload lo hace solo). Frontend refleja el cambio sin tocar BD.
```

### 4.2 Casos de aceptación — Sprint 1

#### HU-001 — Buscar alojamientos por campus (5 SP)

| ID | Gherkin | Pasos manuales | Datos | Esperado | Valida sin BD |
|---|---|---|---|---|---|
| **HU001-C1** | Dado campus **Tulcán** seleccionado, cuando ejecuta búsqueda, entonces solo muestra pubs `ACTIVO` asociadas al campus | 1. Abrir `/` 2. Select `Campus Tulcán (id=1)` 3. Observar listado | `campus_id=1`, pubs `id1,2` ACTIVO + `id3` PENDIENTE (misma zona) | Listado = 2 cards (`id1` 320 m, `id2` 850 m). `id3` **no** aparece | `curl "…/publicaciones?campus_id=1"` contiene solo `estado:ACTIVO`. Edita `mock` para añadir `PENDIENTE` y verifica que frontend no la muestra |
| **HU001-C2** | Si no hay coincidencias, muestra estado vacío informativo y no presenta inactivas | 1. Seleccionar `Sede Centro (id=3)` sin pubs mock o filtrar `precio_min=5M` | `campus_id=3` | Mensaje centrado: *“Sin resultados — prueba otro campus o ajusta filtros (HU-001 C2)”*, grid vacío, no cards `RECHAZADO` | Mock: `mock=[]` → verifica `<p>Sin resultados` visible |
| **HU001-C3** | Cada resultado muestra mínimo: tipo, canon, zona, distancia geodésica, confianza | Inspeccionar Card de `id1` | `id1` | Card muestra: `HABITACION…`, `$450.000`, `Pandiguando`, `320 m`, `Índice 85` con color | DevTools → Elements → `Card.jsx` props |

**Validación extra HU-001:** distancia Haversine razonable: entre `Tulcán (2.443,-76.606)` y `Pandiguando (2.445,-76.610)` debe dar ~400-600 m. Verifica con `backend/app/services/haversine.py`:
```bash
python3 -c "from app.services.haversine import haversine_m; print(haversine_m(2.443,-76.606,2.445,-76.610))"
# esperado ~ 490 m
```

#### HU-002 — Filtrar por precio, tipo y servicios (3 SP)

| ID | Gherkin | Pasos | Datos | Esperado | Sin BD |
|---|---|---|---|---|---|
| **HU002-C1** | Puede indicar rango min/max sin permitir rango inválido | 1. En `Filtros` poner `min=600k max=400k` 2. Intentar aplicar | `min=600000 max=400000` | Error inline: *“Mín no puede ser mayor que Máx”*, **no** dispara `GET`, listado no cambia; corregir `min=400k max=600k` → dispara `GET` | `Filtros.jsx` valida antes de `setFiltros`; `curl` con rango inválido debe devolver `422` si backend valida |
| **HU002-C2** | Filtros tipo + servicios simultáneos | 1. Seleccionar `Tipo: APARTAESTUDIO` + `Servicios: WiFi` 2. Aplicar | `tipo=APARTAESTUDIO servicios=WiFi` | Solo `id2`; query string: `?campus_id=1&tipo=APARTAESTUDIO&servicios=WiFi` visible en Network | Inspeccionar `api.get params` en DevTools Network → Preview filtra mock |
| **HU002-C3** | Al retirar un filtro, resultados se actualizan manteniendo demás criterios | Tras C2, quitar `WiFi` (mantener `APARTAESTUDIO`) | — | Listado se recalcula sin reload, sigue filtrado por tipo | Estado React `filtros` persiste; verificar 2 requests en Network |

**Paso crítico:** combinación con HU-001: cambiar `campus` debe resetear o mantener filtros según diseño acordado (documenta decisión en PR).

#### HU-003 — Consultar detalle (3 SP) · **Publicación no ACTIVO no contactable**

| ID | Gherkin | Pasos | Datos | Esperado | Sin BD |
|---|---|---|---|---|---|
| **HU003-C1** | Ficha presenta canon, depósito (o N/A), tipo, fotos, zona, servicios, reglas, disponibilidad, diferenciando costos no informados | Abrir `/publicacion/1` | `id1` completo | Muestra `$450.000 COP/mes + depósito $200.000`, `Tipo: HABITACION_INDEPENDIENTE`, `4 fotos`, `Pandiguando`, `WiFi, Baño privado`, `Reglas: No mascotas` | `GET /publicaciones/1` JSON contiene todos los campos; `deposito:0` → UI muestra “No informado” no “$0” si aplica |
| **HU003-C2** | Ficha presenta distancia Haversine al campus ref. y fecha actualización | En detalle, leer footer | `dist_m:320`, `updated_at:2026-08-28` | Texto: *“~320 m del Campus Tulcán (distancia geodésica, no tiempo a pie)”* + *“Actualizado: 28 ago 2026”* | Verifica `haversine_m` coincide ±15% con `dist_m` mock |
| **HU003-C3** | Pub **no ACTIVO** no se presenta como disponible para contacto desde catálogo | 1. Buscar con `id3 PENDIENTE` en mock 2. Intentar entrar a `/publicacion/3` vía URL directa | `id3 estado=PENDIENTE`, `id4 RECHAZADO` | **Catálogo:** `id3/4` no aparecen en `/` (C1). **URL directa:** muestra banner *“No disponible para contacto — Estado: PENDIENTE (en moderación)”* y **oculta** botón WhatsApp | Edita `mock` para incluir `PENDIENTE`, verifica `GET /publicaciones/3` devuelve `estado:PENDIENTE` y frontend oculta `wa.me` |

#### HU-005 — Publicar oferta estructurada (5 SP) · **<3 fotos rechazado**

| ID | Gherkin | Pasos | Datos | Esperado | Sin BD |
|---|---|---|---|---|---|
| **HU005-C1** | Solo `ARRENDADOR` autenticado puede crear | 1. Sin login, ir a `/publicar` → Submit | sin token | Redirect a login o `401 No autorizado` + mensaje *“Inicia sesión como arrendador”* | `curl -X POST /api/publicaciones -H "Content-Type: application/json" -d '{…}'` → `401` |
| **HU005-C2** | Form exige campos mínimos + **≥3 fotos** antes de guardar | 1. Login arrendador 2. Llenar título/tipo/canon/zona/dirección 3. Adjuntar **2 fotos** 4. Submit | `fotos:2` | Bloqueo frontend: *“Mínimo 3 fotografías (HU-005 C2)”* botón deshabilitado; si bypass, backend responde `422 fotos: mínimo 3` | Pydantic `PublicacionCreate` valida `len(fotos)>=3`; prueba `curl` con 2 fotos → `422` |
| **HU005-C3** | Publicación creada queda `PENDIENTE` fuera del catálogo público hasta aprobación | Con 3 fotos Submit válido | `fotos:3` | Toast *“Enviada a PENDIENTE — en revisión”*, `GET /publicaciones?campus_id=1` **no** la lista; `GET /publicaciones/{nuevo_id}` muestra `estado:PENDIENTE` | Verifica en mock: `estado:PENDIENTE` filtrado en `list_publicaciones` |

**Validación fotos:** drag 2 JPG + 1 PNG >2 MB debe rechazar por tamaño si se implementa; documenta límite (ej. 5 MB/foto).

#### HU-007 — Índice de confianza 0-100 desglosado (2 SP)

> **Fórmula reproducible (Tabla 14 p25, bug corregido: `PENDIENTE`+`CONFIRMADO`, no `ACTIVO`):** `40 completitud +20 teléfono validado +15 ≥3 fotos +15 vigencia ≤30d +10 sin reportes PENDIENTE/CONFIRMADO = 100`. **Disclaimer obligatorio:** *“Informativo, no garantiza seguridad. Verificar antes de pagar.”*

| ID | Gherkin | Pasos | Datos | Esperado | Sin BD |
|---|---|---|---|---|---|
| **HU007-C1** | Escala 0-100 y siempre muestra factores | Abrir `/publicacion/1` | `id1: 40+20+15+0+10=85` | Badge `85/100` + desglose: `Completitud 40, Tel 20, Fotos 15, Vigencia 0, Reportes 10`. Si cambia 1 factor, índice recalcula | `trust.calcular_indice({...})` → `85`; cambia `num_fotos=1` → `70` |
| **HU007-C2** | No usa datos no comprobables ni criterios ocultos | Inspeccionar `trust.py` | — | Solo los 5 factores; sin “score social” ni “reputación externa”; código comentado `no es garantía` | Review PR verifica `trust.py` sin imports raros |
| **HU007-C3** | Advertencia visible que no es garantía | En detalle | — | Texto gris 12px bajo índice: *“Informativo… verificar identidad y no transferir sin visitar”* + color semáforo `≥80 verde / 50-79 amarillo / <50 gris` | Screenshot móvil incluye advertencia |

**Cálculo manual:**
```bash
python3 -c "from app.services.trust import calcular_indice; print(calcular_indice({'canon':450000,'tipo':'APARTAESTUDIO','direccion':'Cll 5'}, True, 3, 35, 0))"
# vigencia 35d → 0 => 40+20+15+0+10=85? no, 35>30 => 0 => 85
python3 -c "from app.services.trust import calcular_indice; print(calcular_indice({'canon':450000,'tipo':'APARTAESTUDIO','direccion':'Cll 5'}, True, 1, 5, 1))"
# fotos 1 + reporte 1 => 40+20+0+15+0=75
```

#### HU-008 — WhatsApp `wa.me` sin chat interno (2 SP)

| ID | Gherkin | Pasos | Datos | Esperado | Sin BD |
|---|---|---|---|---|---|
| **HU008-C1** | Botón solo cuando hay número autorizado | Abrir `/publicacion/2` (con teléfono) vs `/publicacion/6` (sin) | `id2 tel:573001111111` / `id6 tel:null` | `id2` muestra botón verde *“Contactar por WhatsApp”*; `id6` muestra texto rojo *“Sin WhatsApp autorizado”* sin botón | Mock `telefono_whatsapp:null` → condicional `pub.telefono_whatsapp ? <a> : <p>` |
| **HU008-C2** | Al pulsar abre `wa.me` con mensaje que identifica publicación | Click botón `id1` | `tel 573001234567 tit "Habitación cerca Tulcán" id1` | Nueva pestaña: `https://wa.me/573001234567?text=Hola%2C%20vi%20Habitaci%C3%B3n%20cerca%20Tulc%C3%A1n%20(ID%201)%20en%20AlojaU%20y%20me%20interesa.` → número sin `+`, `text` con `encodeURIComponent` | DevTools Network → `href` exacto; copia URL y verifica en navegador incognito abre `wa.me` (no necesita enviar) |
| **HU008-C3** | No almacena ni modifica conversación | Inspeccionar código | — | No hay `POST /mensajes`, no `localStorage` de chat; solo genera link; PR sin tabla `mensajes` | Grep `grep -r "wa.me" frontend/src` solo en `Detalle.jsx` |

**Seguridad:** teléfono se normaliza `+57 300 123 4567 → 573001234567` (strip `+`, espacios, `-`).

### 4.3 Matriz de regresión rápida (2 min antes de cada merge a develop)

- [ ] HU-001 cambia campus → listado refresca
- [ ] HU-002 rango inválido sigue bloqueado
- [ ] HU-003 detalle PENDIENTE oculta WhatsApp
- [ ] HU-005 2 fotos sigue rechazado
- [ ] HU-007 desglose visible
- [ ] HU-008 `wa.me` con `ID`

### 4.4 Evidencia exigida por HU (para Trello + PR)

Cada HU debe adjuntar en su tarjeta y PR:
- `Desktop.png` + `Mobile.png`
- `curl` o video 20s (opcional) del flujo Gherkin
- Link al commit con `mock` usado si aplica

---

## 5) Uso de Trello + WIP 2 + Revisión cruzada

- **Columna `En desarrollo` WIP=2:** nunca más de 2 tarjetas amarillas. Si quieres tomar una 3ª, termina una o pide ayuda.
- **Revisión cruzada:** el autor NUNCA se auto-aprueba. Ej. Yeixon (HU-001) lo revisa Adrián o Ángel. Queda registro en GitHub `Approved by`.
- **Checklist por tarjeta:** `ID HU` · `Descripción` · `Criterios Gherkin` · `Responsable + colaboradores` · `SP / horas` · `Prototipo/Figma` · `Evidencia (capturas)` · `Link PR` · `DoD 6 puntos`
- **Bloqueado:** etiqueta roja + comentario `Bloqueo: motivo + quién desbloquea + fecha`.

**Flujo visual:**
`Product Backlog` → `Sprint Backlog` → `En desarrollo (WIP2)` → `En revisión/QA (PR abierto)` → `Hecho (PR mergeado + DoD OK)` → `Bloqueado` (si aplica)

---

## 6) Uso responsable de IA — Bitácora, prompts sí/no, 4 controles p.40

### 6.1 Principio
IA es **asistente**, no autor. Transparencia = nota. **60 % autoría humana / 30 % integración con IA / 0 % referencias inventadas** (respeta esa división en memoria).

### 6.2 Qué SÍ se puede promptar

- Generar esqueleto `LaTeX` de tablas (épicas, backlog) a partir de tus datos.
- Redactar criterios Gherkin a partir de tu HU y revisarlos.
- Explicar error `422 Pydantic` o `CORS FastAPI` pegando el traceback.
- Sugerir casos de prueba para `haversine` o `trust` a partir de la fórmula.
- Consolidar `README` o este `SCRUM_Y_QA.md`.

### 6.3 Qué NO se puede delegar a IA

- Inventar fuentes bibliográficas (`[1] Tablero Power BI 2024` sin URL) — **prohibido**.
- Copiar-pegar código de `trust.py`/`haversine.py` sin entender y sin probar local.
- Dejar que IA decida pesos del índice (40/20/15/15/10) o máquina de estados — son **decisiones humanas**.
- Generar capturas Trello/GitHub falsas o links genéricos (`https://trello.com/`) — el tablero debe ser **público y real**.
- Pedir a IA que apruebe tu PR o que haga el QA por ti.

### 6.4 Bitácora obligatoria (Tabla 28 del doc)

Añade al final de tu informe/Anexo y copia cada uso en comentario del PR:

| Fecha | Prompt (resumen) | Herramienta | Salida | Validación humana | Uso final |
|---|---|---|---|---|---|
| 2026-08-28 | “Consolida 10 HU en LaTeX Tabla 13 con INVEST” | Codex | Tabla LaTeX | Revisado vs. Tabla 12 original, corregido `SERIAL→IDENTITY` | Integrado p22-31 |
| 2026-08-26 | “Explica diferencia `localStorage` vs `sessionStorage` para HU-009” | ChatGPT | Definición | Verificado en MDN, probado en `Comparar.jsx` | Nota interna |
| Ago 2026 heredado — validado 2026-08-28 | *(3 prompts heredados sin fecha original)* | Codex | Esqueleto `docker-compose.yml` | Validado con `docker compose config` + arranque local | Adoptado |

> Si no recuerdas fecha exacta, registra como `Ago 2026 heredado — validado 2026-08-28` (no inventes).

### 6.5 4 controles de validación p.40 (obligatorio marcar en cada PR con IA)

- [ ] **C1 — Verificación en fuente oficial:** docs citados (FastAPI, Pydantic v2, React, Leaflet) abiertos y contrastados (no solo respuesta IA).
- [ ] **C2 — Ejecución local:** código generado por IA ejecutado en tu PC (`uvicorn`, `npm run dev`, `pytest`, `curl`) sin error.
- [ ] **C3 — Revisión línea por línea:** leíste y entiendes cada línea añadida; puedes explicarla en sustentación.
- [ ] **C4 — Decisión humana trazable:** pesos índice, estados, endpoints (`/api/publicaciones` no `/api/listings`), mínimo 3 fotos y `wa.me` fueron validados por el equipo, no por IA.

> Si un PR falla 1 control, se marca `Request changes` aunque el código “funcione”.

---

## 7) Comandos de verificación rápida (copy-paste para QA)

```bash
# Salud infra (Tabla16 NFR: SLA 98%)
curl -s http://localhost:8000/health | jq
curl -s http://localhost:8000/docs | head -n 20

# HU-001 / HU-002
curl -s "http://localhost:8000/api/publicaciones?campus_id=1" | jq 'map({id,estado,canon,dist_m})'
curl -s "http://localhost:8000/api/publicaciones?campus_id=1&precio_min=400000&precio_max=600000" | jq

# HU-003
curl -s http://localhost:8000/api/publicaciones/3 | jq '{id,estado,indice_confianza,telefono_whatsapp}'

# HU-005 (debe fallar sin token / con <3 fotos)
curl -s -X POST http://localhost:8000/api/publicaciones \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Test","tipo_inmueble":"APARTAESTUDIO","canon_mensual":500000,"zona_barrio_id":1,"direccion_referencial":"Cll 5 # 4-10","fotos":2}' | jq

# HU-007
python3 -c "from app.services.trust import calcular_indice; print(calcular_indice({'canon':450000,'tipo':'X','direccion':'Y'}, True, 3, 5, 0))"
python3 -c "from app.services.haversine import haversine_m; print(haversine_m(2.443,-76.606,2.445,-76.610))"

# HU-008: genera link esperado
python3 -c "import urllib.parse; print('https://wa.me/573001234567?text='+urllib.parse.quote('Hola, vi Habitación cerca Tulcán (ID 1) en AlojaU y me interesa.'))"

# Frontend build
cd frontend && npm run build && ls -lh dist/
```

---

## 8) Checklist final de Sprint Review (para el SM)

- [ ] Las 6 HU en `Hecho` con DoD 6/6 + 2 capturas c/u
- [ ] `develop` corre en `localhost:8000` + `localhost:5173` sin `500`
- [ ] Demo guionado 5 min: buscar Tulcán → filtrar → detalle → índice 85 → WhatsApp → publicar pendiente
- [ ] Trello público con URL real en informe (no `https://trello.com/`)
- [ ] Tag `v0.1-Sprint1` en `main` tras merge `develop → main`

---

**Mantenimiento:** este doc vive en `docs/SCRUM_Y_QA.md`. Cualquier cambio de WIP, DoD o rotación se propone vía PR con justificación. Última actualización: Sprint 1 (11 días, 20SP/37h). Próximo: Sprint 2 revisa SP/horas reales (velocity).
