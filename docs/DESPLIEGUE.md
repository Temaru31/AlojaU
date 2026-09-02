# AlojaU — Guía de Despliegue Replicable $0 (Vercel + Render + Supabase)

> **Para quién:** cualquier compañero o docente que quiera replicar el deploy en 15 min sin leer todo el histórico. **Objetivo:** `https://aloja-u.vercel.app` (frontend) + `https://alojau-api.onrender.com` (backend) auto-deploy desde `main`, costo $0. **Seguridad:** sin `.env` en repo, `SECRET_KEY` ≥32, `CORS` sin `*`. Actualizado tras deploy real `02-09-2026` (6 pubs en prod).

---

## Índice

1. [Arquitectura $0](#1-arquitectura-0) — por qué Vercel+Render+Supabase
2. [Pre-requisitos](#2-pre-requisitos)
3. [Paso 1 — Supabase (DB 5 min)](#3-paso-1--supabase-db-5-min)
4. [Paso 2 — Render (backend 7 min)](#4-paso-2--render-backend-7-min)
5. [Paso 3 — Vercel (frontend 5 min)](#5-paso-3--vercel-frontend-5-min)
6. [Variables de entorno](#6-variables-de-entorno) — qué poner y dónde, sin exponer
7. [Auto-deploy y flujo Git](#7-auto-deploy-y-flujo-git)
8. [Verificación](#8-verificación-post-deploy)
9. [Costos y límites free](#9-costos-y-límites-free)
10. [Checklist seguridad](#10-checklist-seguridad-pre-entrega)
11. [Errores cometidos — tener presente](#11-errores-cometidos--tener-presente)
12. [FAQ replicar y operar](#12-faq-replicar-y-operar)
13. [Soporte MCP](#13-soporte-mcp)

---

## 1) Arquitectura $0

```
GitHub Temaru31/AlojaU (main)
   ├─auto-deploy─> Vercel (frontend Vite: npm run build → dist) ──VITE_API_URL──> Render (FastAPI: uvicorn $PORT) ──DATABASE_URL (asyncpg+ssl)──> Supabase PG 16 (500MB, pooler)
   └────────────────── config solo por env vars en dashboards (nada en repo) ────────────────────────────────────────────┘
```

**Stack elegido (vs alternativas):**
| Capa | Elegido Free | Por qué | Alternativa |
|------|--------------|---------|-------------|
| Frontend | **Vercel Hobby** | Detecta Vite, `frontend/vercel.json:1` rewrites SPA, env `VITE_API_URL`, 100 deploy/día | Netlify similar, pero Vercel más simple para `react-router` |
| Backend | **Render Free** | `render.yaml:1` + `backend/Dockerfile:1`, `healthCheck /health`, 750h/mes | Railway $5 luego paga, Fly.io requiere Docker manual |
| DB | **Supabase Free** | `SQL Editor` para `schema.sql/seed.sql`, pooler `5432/6543`, 500MB | Neon 3GB, vale si Supabase se llena cambiando solo `DATABASE_URL` |

> Ver `docs/ARQUITECTURA.md:42` para stack oficial $0.

---

## 2) Pre-requisitos

- Acceso GitHub a `Temaru31/AlojaU` (ya lo tienes, `main` en `d821299`).
- Crear cuentas gratuitas (OAuth GitHub, 2 min c/u, sin tarjeta): `vercel.com`, `render.com`, `supabase.com`.
- Terminal local con `openssl` para `SECRET_KEY` (o `python -c "import secrets; print(secrets.token_hex(32))"`).

---

## 3) Paso 1 — Supabase (DB 5 min)

**Qué hace:** crea el PG 16 remoto donde vivirán `publicaciones`, `campus`, etc. (lo que antes era `docker-compose.yml:2` local).

1. `supabase.com → New Project → alojau` → `Region: South America (Sao Paulo)` → `Password: genera y cópiala temporal` → `Create` (1 min).
2. Dentro del proyecto → `Settings (engranaje) → Database → Connection string → Session pooler → Copy`. **No usar `Direct connection`**. Formato `postgresql://postgres.xxx:[PASSWORD]@aws-0-us-east-2.pooler.supabase.com:5432/postgres`.
3. Servirá para Render como `DATABASE_URL` (luego lo convertimos a `postgresql+asyncpg://...` con `ssl=require` — el backend lo hace solo si falta).
4. `SQL Editor → New query` → abre local `backend/db/schema.sql:1` (VS Code → `backend/db/schema.sql` → `Ctrl+A/C`) → pega → `Run` → `Success` (11 tablas + `haversine_m`).
5. `New query` → pega `backend/db/seed.sql:1` → `Run` → `Success`. Verifica `Table Editor → publicaciones` → 6 filas `ACTIVO` (`SELECT count(*) → 6`).

> **Seguridad:** no pegues `DATABASE_URL` en chat público/GitHub. Solo en Render env var. Borra nota temporal tras pegarla.

---

## 4) Paso 2 — Render (backend 7 min)

**Qué hace:** levanta FastAPI de `backend/` con tu `DATABASE_URL` y expone `https://alojau-api.onrender.com`.

1. `render.com → New + → Web Service → Connect GitHub → Temaru31/AlojaU → Connect`.
2. Configurar:
   - `Name: alojau-api`
   - `Runtime: Docker` → `Dockerfile Path: ./backend/Dockerfile` `Context: ./backend` (si eliges `Python` en vez de Docker: `Build: pip install -r backend/requirements.txt` `Start: uvicorn app.main:app --host 0.0.0.0 --port $PORT`)
   - `Plan: Free` `Health Check Path: /health` `Auto-Deploy: Yes` (desde `main`)
3. `Environment → Add` (uno a uno, marca `Sensitive` para secrets):
   ```
   DATABASE_URL=postgresql+asyncpg://postgres.xxx:[PASSWORD]@aws-0-us-east-2.pooler.supabase.com:5432/postgres
   # si copiaste sin +asyncpg ni ssl, el backend lo normaliza a +asyncpg + ssl=require solo
   SECRET_KEY=<64 hex: openssl rand -hex 32>
   CORS_ORIGINS=https://aloja-u.vercel.app,http://localhost:5173,http://localhost:3000
   ENV=prod
   USE_MOCK_FALLBACK=False
   ```
   `SECRET_KEY` debe ser ≥32 y distinto de `cambia_esto...` (`backend/app/core/config.py:14` falla si no).
4. `Create Web Service` → `Build successful` + `Uvicorn running on 0.0.0.0:10000` (3-5 min) → copia URL `https://alojau-api.onrender.com`.
5. Verifica: `curl -s https://alojau-api.onrender.com/health | jq` → `{"status":"ok"}`. Si `500` revisa `Logs` (ahora con `logger.error("[DB fallback]")` en `publicaciones.py:270` y `session.py:11`).

> **Nota Render Free:** duerme tras 15 min, primera petición 15s. `frontend/src/services/api.js:8` ya hace retry 2s.

---

## 5) Paso 3 — Vercel (frontend 5 min)

**Qué hace:** compila `frontend/` (`npm run build` → `dist`) y lo sirve en `https://aloja-u.vercel.app`, conectando al backend vía `VITE_API_URL`.

1. `vercel.com → Add New → Project → Import Temaru31/AlojaU` → autoriza GitHub.
2. Configurar:
   - `Framework Preset: Vite`
   - `Root Directory: Edit → frontend` (clave)
   - `Build Command: npm run build` `Output: dist` `Install: npm install` (viene de `frontend/vercel.json:1`)
3. `Environment Variables → Add`:
   ```
   VITE_API_URL=https://alojau-api.onrender.com
   ```
   Sin `/` final.
4. `Deploy` → 2 min → URL `https://aloja-u.vercel.app` (si es `aloja-u-xxx.vercel.app` renombra en `Settings → Domains`).
5. Verifica: abre `https://aloja-u.vercel.app` → `6 publicaciones ACTIVAS` (ya con DB real). DevTools `Network → api/publicaciones?campus_id=1` 200.
6. **Volver a Render:** si tu URL Vercel no es exactamente `https://aloja-u.vercel.app`, edita `CORS_ORIGINS` y añade la real (ej: `https://aloja-u-1a2b.vercel.app`) → `Manual Deploy → Deploy latest commit`.

---

## 6) Variables de entorno

| Servicio | Key | Ejemplo | Dónde | Secreto |
|----------|-----|---------|-------|---------|
| Render | `DATABASE_URL` | `postgresql+asyncpg://postgres...@pooler.supabase.com:5432/postgres` | Render → Environment | **Sí** |
| Render | `SECRET_KEY` | `openssl rand -hex 32` → `a3f8...64` | Render (Sensitive) | **Sí** |
| Render | `CORS_ORIGINS` | `https://aloja-u.vercel.app,http://localhost:5173` | Render | No |
| Render | `ENV` | `prod` | Render | No |
| Render | `USE_MOCK_FALLBACK` | `False` | Render | No |
| Vercel | `VITE_API_URL` | `https://alojau-api.onrender.com` | Vercel → Settings → Env | No |

**No hacer:** `CORS_ORIGINS=*` con `allow_credentials` (inseguro, `main.py:19` lo bloquea), `SECRET_KEY` corto, `DATABASE_URL` sin `+asyncpg`, subir `.env` (ya en `.gitignore:7`).

---

## 7) Auto-deploy y flujo Git

- Vercel y Render hacen `auto-deploy` en push a `main` (`render.yaml:10` `autoDeploy: true`). Para desactivar: `Settings → Git → Auto Deploy: Off`.
- Flujo equipo (`docs/SCRUM_Y_QA.md:90`): `feature/* → PR → develop → PR → main`. Cada push a `main` redespliega front+back en 2-4 min.
- Rollback: Vercel `Deployments → Redeploy`, Render `Manual Deploy → Deploy previous commit`.

---

## 8) Verificación post-deploy

```bash
# backend
curl -s https://alojau-api.onrender.com/health | jq
curl -s "https://alojau-api.onrender.com/api/publicaciones?campus_id=1&page=1&size=2" | jq '{total,pages,ids:[.items[].id]}'
curl -s -I -H "Origin: https://aloja-u.vercel.app" https://alojau-api.onrender.com/health | grep -i access-control
# frontend
# https://aloja-u.vercel.app → Buscar 6 pubs, filtrar tipo APARTAESTUDIO (2), servicios 1,4 (2), Comparar 2/3, Favoritos ♥
# https://aloja-u.vercel.app/publicacion/1 → mapa Leaflet + WhatsApp
```

**Esperado:** health 200, `total:6`, CORS `allow-origin: https://aloja-u.vercel.app`, frontend sin 500.

---

## 9) Costos y límites free

- **Vercel Hobby:** 100 deploy/día, sin tarjeta.
- **Render Free:** 750h/mes, duerme 15min, 512MB. Avisa del cold-start al profesor.
- **Supabase Free:** 500MB, backup diario. Si se llena, cambia solo `DATABASE_URL` a Neon (3GB).

---

## 10) Checklist seguridad pre-entrega

- [ ] `git ls-files | grep .env` vacío
- [ ] `SECRET_KEY` ≥32 y no es ejemplo
- [ ] `CORS_ORIGINS` sin `*`
- [ ] `DATABASE_URL` con `+asyncpg`
- [ ] `/health` sin `password`/`secret`
- [ ] Upload futuro valida `image/*` y 5MB

---

## 11) Errores cometidos — tener presente

1. **`bcrypt 4.1+ ValueError: password cannot be longer than 72 bytes`** — `passlib 1.7.4` + `bcrypt 4.1+` falla aunque password sea corta (`AlojaU123`). **Fix:** `backend/requirements.txt:11` `bcrypt==4.0.1` (commit `004a47e`). Render falló en `Build → Live` hasta pinnear.
2. **`pgbouncer=true` extra con `5432`** — Supabase Session pooler (`5432`) no necesita `pgbouncer=true` (Transaction pooler `6543` sí). Poner `?pgbouncer=true` en `5432` causaba fallback a mock (2 pubs) aunque `seed.sql` tenía 6. **Fix:** usar `5432` sin `pgbouncer` o `6543` con `?pgbouncer=true`; backend ahora normaliza y añade `ssl=require` solo si falta (`session.py:11`).
3. **`DATABASE_URL` sin `+asyncpg`** — `postgresql://` solo falla en `create_async_engine`. **Fix:** `_normalize_supabase_url` convierte a `postgresql+asyncpg://` si falta.
4. **CORS `*` o sin Vercel URL** — `main.py:19` `CORSMiddleware` con `allow_origins=["*"]` + `allow_credentials True` es inseguro y bloquea credenciales. **Fix:** `CORS_ORIGINS` con lista explícita `https://aloja-u.vercel.app,http://localhost:5173`.
5. **Olvidar `seed.sql` tras `schema.sql`** — `schema` crea tablas vacías, frontend muestra `0 publicaciones`. Verificar `Table Editor → publicaciones` 6 filas.
6. **Usar `Direct connection` en vez de `Session pooler`** — `Direct` expone IP sin pool, Render Free lo corta. Usar `Session pooler` siempre.
7. **Frente sin `Root Directory: frontend`** — Vercel intenta `npm run build` en raíz y falla `no such file`. Poner `frontend` en Vercel `Root Directory`.

---

## 12) FAQ replicar y operar

**¿Si añado una publicación desde la página o modifico Supabase, se auto-actualiza?**
- **Sí, directo:** `POST /api/publicaciones` (desde `/publicar` con login ARRENDADOR) crea `PENDIENTE` en Supabase (no mock). `GET /api/publicaciones` siempre lee Supabase real (ya no mock). Verás el nuevo ID en `Table Editor → publicaciones` al instante y, tras aprovação `ACTIVO`, aparece en `https://aloja-u.vercel.app` sin hacer nada más. Modificar/borrar en `Table Editor` también se refleja en la próxima petición (no hay cache). Lo que **no** se auto-actualiza es el código: cambiar `frontend/` o `backend/` requiere push.

**¿Front y back están directamente conectados?**
- **Sí.** `frontend/src/services/api.js:5` usa `import.meta.env.VITE_API_URL` (`https://alojau-api.onrender.com` en prod). Cada `Buscar` hace `GET https://alojau-api.onrender.com/api/publicaciones?campus_id=1` con `CORS` permitido. No hay proxy intermedio. Si backend duerme (Render Free 15 min), frontend reintenta 2s y muestra datos tras cold-start.

**¿Si hago cambios y push a `main` se despliegan solos o debo hacer algo?**
- **Automático.** Vercel y Render tienen `Auto-Deploy on push to main` activo. Haces `git add . && git commit -m "feat: ..." && git push origin main` → en 2-4 min ambos se redeployan solos (ver `Vercel → Deployments` y `Render → Events: Deploying → Live`). No necesitas `Manual Deploy` salvo que quieras forzar o rollback. Para pausar: `Settings → Git → Auto Deploy: Off`.

**¿Debo guardar contraseñas o compartir algo con compañeros?**
- **Guardar:** sí, en lugar seguro (no en repo): `DATABASE_URL` completa (con password), `SECRET_KEY` (64 hex), `Supabase project password`. No las subas a GitHub ni a WhatsApp sin cifrar. **Compartir con equipo:** dales acceso al proyecto Supabase (`Supabase → Team → Invite` con su email) y al Team Vercel/Render (`Settings → Teams → Invite`), no les pases la URL con password por chat. Cada uno puede ver las env vars en dashboards (Render `Environment` y Vercel `Settings`) si tiene acceso. Si rotas `SECRET_KEY` todos los JWT viejos expiran (8h) y deben reloguear.

---

## 13) Soporte MCP

Si quieres que lo replique yo vía navegador: dime `abre Supabase/Render/Vercel` y uso `desktop-control` para clickear. Tú solo loguéate y autoriza GitHub; yo guío y pego env vars que me dictes. No haré `Create Project` sin tu OK.

> Última verificación local: `PYTHONPATH=backend pytest -q` 47 passed, `cd frontend && npm run test:run` 38 passed, `npm run build` 483kB.
