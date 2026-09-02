# AlojaU — Guía de Despliegue Gratuito $0 (Vercel + Render + Supabase)

> **Objetivo:** URL limpia `https://alojau.vercel.app` (frontend) + `https://alojau-api.onrender.com` (backend) auto-deploy desde `main`. Costo $0, cold-start 10-15s en Render Free. **Seguridad primero:** no subir `.env`, `SECRET_KEY` ≥32, `CORS` sin `*`.

---

## 1) Arquitectura $0

```
GitHub Temaru31/AlojaU (main) ──auto-deploy──> Vercel (frontend Vite) ──VITE_API_URL──> Render (FastAPI) ──DATABASE_URL──> Supabase PG (500MB)
       │                                                                              │
       └─────────────── TODA la config vía env vars en dashboards (no en repo) ───────┘
```

**Por qué este stack (vs Railway/Fly/Netlify):** documentado en `docs/ARQUITECTURA.md:42`, Vercel detecta Vite sin config, Render Free 750h/mes + `healthCheckPath: /health`, Supabase tiene SQL editor para `schema.sql`/`seed.sql` y pooler. Alternativa Neon (3GB) vale si Supabase se llena.

---

## 2) Pre-requisitos (tú)

- Cuenta GitHub con acceso `Temaru31/AlojaU` (ya la tienes).
- Crear cuentas (2 min c/u, OAuth GitHub) en: `vercel.com`, `render.com`, `supabase.com`. No requieren tarjeta para free tier.
- Tener `openssl` o generador para `SECRET_KEY` (te doy comando, no lo guardo).

---

## 3) Paso 1 — Base de datos Supabase (5 min)

1. `supabase.com → New Project → alojau` (región `South America (Sao Paulo)` más cercana, password DB anotar temporal).
2. Project → `Settings → Database → Connection string → Session pooler → Copy` (formato `postgresql://postgres.xxx:pass@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true`). **No copiar `Direct connection`**.
3. Convertir para asyncpg: cambiar `postgresql://` → `postgresql+asyncpg://` (ej: `postgresql+asyncpg://postgres.xxx:pass@.../postgres?pgbouncer=true`). Guardar como `DATABASE_URL` temporal en notas.
4. `SQL Editor → New query` → pegar **contenido completo** de `backend/db/schema.sql:1` → `Run` → debe decir `Success`. Luego pegar `backend/db/seed.sql:1` → `Run` → verifica `Table 6 rows` en `Table Editor → publicaciones` (6 ACTIVO, Tulcán 111m etc.).

> **Seguridad:** no pegar `DATABASE_URL` en chat público ni en GitHub. Solo en Render env var. Borra notas tras pegar.

---

## 4) Paso 2 — Backend Render (7 min)

1. `render.com → New + → Web Service → Connect GitHub → Temaru31/AlojaU → Connect`.
2. Configurar:
   - `Name: alojau-api`
   - `Runtime: Docker` (usa `backend/Dockerfile:1`, si eliges `Python` en vez de Docker, usar `Build: pip install -r backend/requirements.txt` y `Start: uvicorn app.main:app --host 0.0.0.0 --port $PORT`)
   - `Dockerfile Path: ./backend/Dockerfile` `Docker Context: ./backend`
   - `Plan: Free`
   - `Health Check Path: /health`
   - `Auto-Deploy: Yes` (desde `main`)
3. `Environment → Add Environment Variable` (usar `Add` uno a uno, **Sensitive** para secrets):
   ```
   DATABASE_URL=postgresql+asyncpg://postgres.xxx:pass@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
   SECRET_KEY=<pega aquí 64 chars: generar con `openssl rand -hex 32` en tu terminal local, nunca usar el ejemplo>
   CORS_ORIGINS=https://alojau.vercel.app,http://localhost:5173,http://localhost:3000
   ENV=prod
   USE_MOCK_FALLBACK=False
   ```
   > `SECRET_KEY` debe ser ≥32 chars y distinto de `cambia_esto...` (`backend/app/core/config.py:14` valida y falla si no).
4. `Create Web Service` → espera 3-5 min build. Ver logs `Build successful` + `Uvicorn running on http://0.0.0.0:10000`. Copiar URL `https://alojau-api.onrender.com`.
5. Verificar: `curl -s https://alojau-api.onrender.com/health | jq` → `{"status":"ok"}`. Si `500` revisar `DATABASE_URL` (¿asyncpg? ¿pooler?).

> **Tip Render Free:** duerme tras 15min inactividad, primera petición tarda 15s (ver `frontend/src/services/api.js:8` retry 2s ya maneja cold-start).

---

## 5) Paso 3 — Frontend Vercel (5 min)

1. `vercel.com → Add New → Project → Import Temaru31/AlojaU` (autorizar GitHub si pide).
2. Configurar:
   - `Framework Preset: Vite`
   - `Root Directory: frontend` (clic `Edit` → `frontend`)
   - `Build Command: npm run build` (autodetectado via `frontend/vercel.json:3`)
   - `Output Directory: dist`
   - `Install Command: npm install`
3. `Environment Variables` → `Add`:
   ```
   VITE_API_URL=https://alojau-api.onrender.com
   ```
   (sin `/` final, sin `http://localhost`).
4. `Deploy` → 2 min → URL `https://alojau.vercel.app` (Vercel te da `alojau-xxx.vercel.app`, puedes renombrar en `Settings → Domains → alojau.vercel.app` si libre).
5. Verificar: abre `https://alojau.vercel.app` → Buscar 6 pubs, filtros, Detalle. Abre DevTools Network → `api/publicaciones?campus_id=1` 200.

6. **Volver a Render:** editar `CORS_ORIGINS` y añadir tu URL real de Vercel si es distinta de `https://alojau.vercel.app` (ej: `https://alojau-1a2b.vercel.app`). `Manual Deploy → Deploy latest commit` para recargar.

---

## 6) Variables de entorno — referencia segura

| Servicio | Key | Ejemplo | Dónde | Secreto |
|----------|-----|---------|-------|---------|
| Render | `DATABASE_URL` | `postgresql+asyncpg://postgres...@pooler.supabase.com:6543/postgres?pgbouncer=true` | Render → Web Service → Environment | **Sí** |
| Render | `SECRET_KEY` | `openssl rand -hex 32` → `a3f8...64chars` | Render → Environment (Sensitive) | **Sí** |
| Render | `CORS_ORIGINS` | `https://alojau.vercel.app,http://localhost:5173` | Render → Environment | No |
| Render | `ENV` | `prod` | Render | No |
| Render | `USE_MOCK_FALLBACK` | `False` | Render | No |
| Vercel | `VITE_API_URL` | `https://alojau-api.onrender.com` | Vercel → Settings → Environment Variables | No |

**No hacer:** `CORS_ORIGINS=*` con `allow_credentials True` (inseguro, `backend/app/main.py:19` bloquea), `SECRET_KEY` corto (<32) o ejemplo, `DATABASE_URL` con `postgresql://` sin `+asyncpg` (falla `asyncpg`), subir `.env` a Git (` .gitignore:7` ya lo bloquea).

---

## 7) Auto-deploy desde `main`

- Vercel y Render por defecto hacen `auto-deploy` en push a `main` (ver `render.yaml:10` `autoDeploy: true` y `vercel.json:1` rewrites). Para desactivar: `Settings → Git → Auto Deploy: Off`.
- Flujo equipo: `feature/* → PR → develop → PR → main` (`docs/SCRUM_Y_QA.md:90`). Cada push a `main` redespliega front+back en 2-4 min.
- Rollback: en Vercel `Deployments → ... → Redeploy`, en Render `Manual Deploy → Deploy previous`.

---

## 8) Verificación post-deploy (copy-paste)

```bash
# backend
curl -s https://alojau-api.onrender.com/health | jq
curl -s "https://alojau-api.onrender.com/api/publicaciones?campus_id=1&page=1&size=2" | jq '{total,pages,ids:[.items[].id]}'
curl -s -I -H "Origin: https://alojau.vercel.app" https://alojau-api.onrender.com/health | grep -i access-control

# frontend (abrir navegador)
# https://alojau.vercel.app → Buscar 6 pubs, filtrar tipo APARTAESTUDIO (2), servicios WiFi+Amoblado (2), Comparar 2/3 tabla, Favoritos ♥
# https://alojau.vercel.app/publicacion/1 → mapa Leaflet + WhatsApp
# https://alojau.vercel.app/comparar → si vacío, "No hay publicaciones"
```

**Esperado:** health 200, `total:6`, CORS `allow-origin: https://alojau.vercel.app` (no `*`), frontend carga sin 500.

---

## 9) Costo $0 y límites

- **Vercel Hobby:** 100 deploy/día, 10k req/mes, sin tarjeta. Suficiente sprint demo.
- **Render Free:** 750h/mes (1 servicio 24/7 cabe), duerme 15min, 512MB RAM. Para demo avisa profesor del cold-start 15s.
- **Supabase Free:** 500MB, 50k MAU, backup diario. Si 500MB se llena, migrar a Neon (3GB) cambiando solo `DATABASE_URL`.
- **Alternativa si Render falla:** usar `Railway` ($5 free) con mismo `DATABASE_URL` y `CORS`.

---

## 10) Checklist seguridad pre-entrega

- [ ] `.env` no trackeado (`git ls-files | grep .env` vacío)
- [ ] `SECRET_KEY` ≥32 y no es ejemplo (probar `ENV=prod` local falla si no)
- [ ] `CORS_ORIGINS` sin `*`, solo Vercel + localhost
- [ ] `DATABASE_URL` con `+asyncpg` y `pgbouncer=true`
- [ ] `/health` sin exponer `password`/`secret`
- [ ] `POST /api/publicaciones/upload` (cuando exista) valida `image/*` y 5MB

---

## 11) Soporte MCP

Si quieres que lo configure yo vía navegador: dime `abre Vercel`/`Render`/`Supabase` y uso `desktop-control` para clickear. Necesitarás loguearte y autorizar GitHub; yo guío clicks y pego env vars que me dictes. No haré `Create Project` sin tu OK.

> **Última verificación local antes de desplegar:** `PYTHONPATH=backend pytest -q` 47 passed, `cd frontend && npm run test:run` 38 passed, `npm run build` 483kB.
