# Seguridad AlojaU

## 1) Token GitHub (push inicial)

El token `ghp_...` usado para el push inicial está guardado en `~/.git-credentials` via `credential.helper store`.

Recomendación: después de verificar que `git push` ya no pide password, revoca el token clásico en GitHub:
Settings → Developer settings → Personal access tokens → Tokens (classic) → Delete `AlojaU`

Para futuros pushes usa `gh auth login` o SSH (más seguro):
```bash
ssh-keygen -t ed25519 -C "adcaicedo@unicauca.edu.co"
cat ~/.ssh/id_ed25519.pub  # pégalo en GitHub → Settings → SSH and GPG keys → New SSH key
git remote set-url origin git@github.com:Temaru31/AlojaU.git
```

No compartas el ghp_ en chats.

## 2) RLS Supabase PROD - Verificación (SEC-rls-verify)

Contexto: PROD tiene `ENABLE RLS` en 11 tablas + policies (catálogos `public_read`,
`publicaciones` solo `ACTIVO`, sensibles sin policy = denegar anon). Transacción ya
aplicada vía SQL Editor (`Success`).

Coherencia backend: `backend/app/db/session.py` usa `postgresql+asyncpg` con rol
owner (`DATABASE_URL` Session Pooler `postgres.xxx`, `ssl=require`). Owner **bypassa
RLS por diseño** (Postgres: RLS no aplica a table owner/superuser salvo `FORCE RLS`).
Por eso backend no se rompe. **NO activar `FORCE RLS`** en ninguna tabla
(`backend/db/schema.sql` tampoco lo tiene). Confirmado: repo sin `FORCE RLS`,
sin `anon`/`service_role` en código.

Fail-closed: `backend/app/core/config.py` no arranca en `prod` con
`SECRET_KEY` default/corto o `USE_MOCK_FALLBACK=True` (`model_validator fail_closed_prod`).
`backend/app/core/security.py` solo acepta `MOCK_TOKENS` si `USE_MOCK_FALLBACK=True`
**y** `ENV!=prod` (doble check `settings.ENV` + `os.getenv`). Ver
`backend/.env.example` y `render.yaml` (`ENV=prod`, `USE_MOCK_FALLBACK=False`).

### 2.1 Advisors 0 errores

1. Supabase Dashboard → `Database → Advisors → Security`.
2. Esperado: `0 errors` en `RLS disabled` / `Policy exists`. Si aparece tabla sin RLS:
```sql
-- Verificación RLS 11 tablas
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables WHERE schemaname='public' ORDER BY 1;
-- Esperado: 11 filas con rls_enabled=true

SELECT schemaname, tablename, policyname, roles, cmd, qual
FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname;
-- Esperado: catálogos (ciudades, zonas_barrios, campus_universitarios,
-- servicios_catalogo) con public_read USING(true) FOR SELECT TO anon,authenticated;
-- publicaciones solo ACTIVO: USING(estado='ACTIVO') FOR SELECT;
-- sensibles (usuarios, reportes_publicacion, publicaciones_audit, etc.) sin policy
-- => anon ve 0 filas (fail-closed).
SELECT * FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity;
-- Esperado: 0 filas. Si hay fila => falta ENABLE RLS.
```
3. `Linter → Security`: sin `WARN` de `FORCE RLS` (no debe existir).

### 2.2 Curls anon bloqueado vs público OK (Supabase PostgREST + Backend)

```bash
export SUPABASE_URL="https://xxx.supabase.co"
export ANON_KEY="<anon-key>"   # nunca commitear
export API="https://alojau-api.onrender.com"  # o http://localhost:8000

# --- Supabase directo (rol anon) ---
# Público OK: catálogos (policy public_read)
curl -s -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  "$SUPABASE_URL/rest/v1/servicios_catalogo?select=id,nombre&limit=2" | head -c 300
# Esperado 200 con filas.

curl -s -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  "$SUPABASE_URL/rest/v1/publicaciones?estado=eq.ACTIVO&select=id,titulo,estado&limit=2" | head -c 500
# Esperado 200 solo ACTIVO.

# Anon bloqueado: sensibles sin policy => 200 con [] (0 filas, RLS deniega)
curl -s -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  "$SUPABASE_URL/rest/v1/usuarios?select=id&limit=1"
# Esperado: []

curl -s -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  "$SUPABASE_URL/rest/v1/publicaciones?estado=eq.PENDIENTE&select=id,estado&limit=1"
# Esperado: [] (policy solo ACTIVO filtra PENDIENTE)

# --- Backend FastAPI (owner, filtra en código estado==ACTIVO) ---
curl -s "$API/health" | grep -q '"status":"ok"' && echo "health OK"
curl -s "$API/api/publicaciones?campus_id=1&page=1&size=2" | python3 -c "import sys,json;d=json.load(sys.stdin);print('total',d['total'],'estados',set(p['estado'] for p in d['items']));assert all(p['estado']=='ACTIVO' for p in d['items'])"
# Esperado: solo ACTIVO.

curl -s -X POST "$API/api/publicaciones" -H "Content-Type: application/json" -d '{}' -w "\n%{http_code}\n" | tail -1
# Esperado: 401 (sin token)

curl -s -X POST "$API/api/publicaciones" -H "Content-Type: application/json" \
  -H "Authorization: Bearer mock-token-arrendador" -d '{}' -w "\n%{http_code}\n" | tail -1
# Esperado en prod (ENV=prod, USE_MOCK_FALLBACK=False): 401
# En dev (ENV=dev): 422 (mock aceptado, falla validación payload, no auth)
# Ver test backend/tests/test_prod_rls.py::test_prod_mock_401
```

Si `mock-token-arrendador` da `201/422` en prod => `ENV`/`USE_MOCK_FALLBACK` mal
configurados en Render. Revisar `render.yaml:22-25` y re-deploy.

