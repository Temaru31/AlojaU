# AlojaU — Auth Empresarial v13 (Enterprise Auth Architecture)

> Alcance: autenticación, autorización e identidad de nivel empresarial en
> capas gratuitas (Vercel + Render + Supabase), cero deuda técnica.

## 1. Reporte de arquitectura y sincronización Git

- Sincronizado con `origin/main` (`git pull --rebase origin/main`): HEAD
  `703fbd5` (merge PR #13: Dependabot + CodeQL + 32 tests PG + schema sync).
- Suite base antes del cambio: `test_security.py` 22/22 en mock.
- Suite después: backend **202 + 16 (v13) pass**, frontend **279 + 9 (v13) pass**.

### Pre-mortem (Fase 0 — riesgos y mitigación)

| # | Riesgo | Mitigación |
|---|--------|------------|
| 1 | Caída de Supabase/Render (cold start 15–45 s) | `AuthService` con fallback local HS256; cliente con exponential backoff (2 s → 4 s, tope 5 s, 2 reintentos, timeout 55 s) + banner *"Iniciando servidores seguros de AlojaU, dame unos segundos..."* + skeletons. Backend: `pool_pre_ping`, `pool_recycle=300`, `NullPool` en pytest. Endpoints de lectura responden 503 explícito en prod (nunca cuelgan). |
| 2 | Google con email ya registrado manual | Identity linking por email normalizado (`lower+trim`): fusiona (`auth_provider=password+google`, `supabase_id`, `email_verificado=True`), nunca duplica. Carrera concurrente: `UNIQUE(email)` + `IntegrityError` → re-lee y vincula. Login dual conservado. |
| 3 | Nuevos roles (`MODERADOR_CAMPUS`, `AUDITOR_LEGAL`) | Ya existen en `chk_rol` + `ROLE_SCOPES` + matriz. Añadir un rol = 1 entrada en `ROLE_SCOPES` (+ `register_role()` en caliente). Endpoints exigen **scopes**, no nombres de rol. Rol desconocido → `set()` vacío (deny-by-default). |

## 2. Mapa de archivos (qué se creó / tocó)

**Backend**
- `app/core/permissions.py` (nuevo): catálogo `SCOPE_CATALOG`, `ROLE_SCOPES`
  (ESTUDIANTE/ARRENDADOR/ADMIN + futuros), `scopes_for_role()`,
  `user_scopes()` (intersección anti-tampering), `require_scope()`,
  `require_any_scope()`, `register_role()`.
- `app/core/auth_service.py` (nuevo): interfaz `AuthService`,
  `LocalAuthService` (HS256), `SupabaseAuthService` (RS256 vía JWKS con
  caché TTL 10 min, verifica firma+`iss`+`aud`+`exp`), `get_auth_service()`,
  `decode_token_provider_agnostic()` (convivencia de proveedores).
- `app/core/security.py`: tokens con `jti` + `scopes`; mocks
  `estudiante`/`auditor` para tests.
- `app/core/config.py`: `SUPABASE_*`, `FRONTEND_*`, `TELEGRAM_*`,
  `POLITICA_VERSION`, `jwks_url`, `oauth_redirect_urls`.
- `app/models/__init__.py`: `Usuario` con `ESTUDIANTE` base + Ley 1581
  (`acepto_tratamiento_datos`, `fecha_consentimiento`, `ip_consentimiento`,
  `version_politica`) + `auth_provider/supabase_id/email_verificado`;
  tablas `rate_limit_attempts`, `otp_codes`, `password_resets`, `sesiones`.
- `app/routers/auth.py`: registro Ley 1581, login con rate-limit
  memoria+PG, OTP 6 dígitos/10 min, recovery un solo uso/15 min + fortaleza
  v13, `GET /oauth/google` + `POST /oauth/google/callback` (linking),
  `POST /promover`, `GET /sesiones` + `POST /sesiones/revocar-todas`.
- `app/routers/publicaciones.py`: `POST` exige `publications:write`;
  **promoción automática** ESTUDIANTE→ARRENDADOR + gate de email verificado.
- Migraciones: `alembic/versions/007_auth_enterprise.py` +
  `db/migrations/007_auth_enterprise.sql` (+ fix `usuarios_rol_check`
  legacy y `setval usuarios_id_seq` en `seed.sql`).
- `db/schema.sql`: tablas/columnas v13 (CI desde cero OK).
- Tests: `tests/test_auth_v13.py` (16, prefijo `test_user_tmp_*` +
  teardown PG+mocks), ajustes en `test_hu_sprint1.py` (ADMIN publica por
  scopes; 403 lo da `AUDITOR_LEGAL`) y `test_indices_sync.py` (cobertura 007).

**Frontend**
- `services/supabaseClient.js`: `signInWithOAuth({provider:'google'})`
  vía SDK inyectado o redirect estándar; `redirect_to` dev
  (`http://localhost:5173/auth/callback`) y prod canónica
  (`https://aloja-u.vercel.app/auth/callback`).
- `components/GoogleButton.jsx/.css`: marca oficial Google (G SVG 4
  colores, Roboto, hover/active/focus, dark mode, accesible).
- `pages/AuthCallback.jsx` (`/auth/callback`): linking sin duplicados.
- `components/OtpForm.jsx`, `components/PasswordStrength.jsx` (8+mayús+
  número+especial), `pages/Recuperar.jsx` (`/recuperar`),
  `pages/Restablecer.jsx` (`/restablecer`).
- `components/Legal.jsx` + `pages/Terminos.jsx` (`/terminos`) +
  `pages/Privacidad.jsx` (`/privacidad`): Ley 1581 de 2012.
- `components/RegistroForm.jsx`: registro ESTUDIANTE + checkbox legal
  obligatoria + modales + OTP post-registro.
- `pages/Perfil.jsx`: tabs Entrar/Crear cuenta, botón Google,
  “¿Olvidaste tu contraseña?”, OTP si email sin verificar, sesiones
  activas + “Cerrar sesión en todos los dispositivos”.
- `components/ColdStartBanner.jsx` (mensaje exacto requerido) +
  `components/ColdStartSkeleton.jsx`; `api.js` ya tenía backoff (verificado).
- `pages/Publicar.jsx`: mensaje 403 guía (verificación/promoción).
- Tests: `components/AuthEnterprise.test.jsx` (9).

## 3. Guía de configuración manual (human-in-the-loop)

> Si Supabase/Google no están configurados, la app funciona 100 % con el
> proveedor local. Estos pasos solo habilitan el login con Google real.

### A. Google Cloud Console (~10 min)

1. Ve a <https://console.cloud.google.com/> → crea/selecciona proyecto
   **AlojaU** → **APIs y servicios → Pantalla de consentimiento OAuth**:
   tipo **Externo**, nombre `AlojaU`, correo de asistencia, dominios
   `aloja-u.vercel.app` → **Guardar**.
2. **Credenciales → Crear credenciales → ID de cliente OAuth** → tipo
   **Aplicación web** → nombre `AlojaU Supabase` → **Orígenes autorizados**:
   `https://xxx.supabase.co` (tu `SUPABASE_URL`) →
   **URIs de redirección autorizados**: `https://xxx.supabase.co/auth/v1/callback`
   → **Crear**. Copia **Client ID** y **Client Secret**.

### B. Supabase Dashboard (~5 min)

1. <https://supabase.com/dashboard> → proyecto → **Authentication →
   Providers → Google → Enable**: pega Client ID/Secret → **Save**.
2. **Authentication → URL Configuration**: **Site URL** =
   `https://aloja-u.vercel.app`; **Redirect URLs** añade:
   - `http://localhost:5173/auth/callback` (dev)
   - `https://aloja-u.vercel.app/auth/callback` (prod)
3. **Settings → API**: copia `Project URL` (= `SUPABASE_URL`) y
   `anon public` (= `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`).

### C. Variables de entorno

**Render (backend)** — Dashboard → servicio → Environment:
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_AUD=authenticated`,
`FRONTEND_URL=http://localhost:5173`,
`FRONTEND_PROD_URL=https://aloja-u.vercel.app`,
(opcional OTP Telegram) `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
Aplica la migración en tu PG: `psql $DATABASE_URL -f
backend/db/migrations/007_auth_enterprise.sql` (o `alembic upgrade head`
si usas env alembic).

**Vercel (frontend)** — Settings → Environment Variables:
`VITE_API_URL=https://<tu-api>.onrender.com`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` → **Redeploy**.

### D. Verificación (5 min)

1. `/perfil` → **Continuar con Google** → acepta → vuelves a `/` logueado.
2. Con un correo ya registrado manual: entra con Google con el **mismo**
   correo → `/perfil` muestra proveedor `password+google`, sin cuenta doble.
3. Supabase → **Authentication → Users**: aparece el usuario Google.

## 4. Probar en localhost y producción

### Localhost

```bash
# PG local arriba; aplica migración 007 una vez:
psql postgresql://alojau:alojau123@localhost:5432/alojau \
  -f backend/db/migrations/007_auth_enterprise.sql

# Backend
cd backend && python3 -m uvicorn app.main:app --reload --port 8000
# Frontend (otra terminal)
cd frontend && npm run dev   # http://localhost:5173
```

Flujos: registro en `/perfil` (tab Crear cuenta, sin checkbox = 422);
OTP en Mi Perfil si email sin verificar; `/recuperar` → `/restablecer`
(dev muestra el enlace directo); publicar con ESTUDIANTE promueve a
ARRENDADOR; `/admin/dashboard` con ESTUDIANTE = 403; sesiones en
Mi Perfil → Seguridad → revocar todas.

### Producción — <https://aloja-u.vercel.app>

Mismos flujos contra la API de Render. Primer acceso del día: verás
*“Iniciando servidores seguros de AlojaU, dame unos segundos...”*
(15–45 s, normal en Render Free) y la app reintenta sola.

## 5. V13.2 — Ciclo de vida dinámico + perfil marketplace (2026-09)

- **Democión N→0**: `DELETE /api/publicaciones/{id}` (dueño/admin) + hooks en
  moderación admin; conteo de vigentes + cambio de rol con `SELECT ... FOR UPDATE`
  en la misma transacción (`app/services/role_lifecycle.py`). Nunca por expiración,
  nunca a ADMIN/otros roles, nunca a cuentas en soft-delete.
- **Anti-staleness JWT**: el gate de escritura deriva rol/scopes de BD
  (`teléfono`, `email`, `rol` reales); respuestas con `rol` + `rol_actualizado`
  y el frontend llama a `refresh()` (Publicar/MisPublicaciones).
- **Perfil flexible**: `telefono` NULL (se exige al publicar → 400 con guía),
  `bio`, `foto_perfil_url` (solo https), `preferencias` JSONB con namespaces
  `filtros.* roomie.* notis.*`, tope 4 KB/30 claves/profundidad 3.
  Migración **009** (`db/migrations/009_profile_jsonb_preferences.sql`):
  incluye backfill `573000000000 → NULL` (placeholder Google).
- **Onboarding progresivo**: registro sin teléfono; checklist "Completa tu perfil"
  en Mi Perfil; email Google inmutable (cambio con re-OTP = fase futura).
- **Supabase prod**: aplicar además el `009_...sql` en SQL Editor.

## 6. V14.1 — Remediación ALTA + purga + UX (2026-09)

- **Revocación central**: `get_current_user` (async) verifica `jti` en `sesiones`
  en TODOS los endpoints autenticados. Exentos: tokens sin `jti` (legacy/mock).
  Prod + error DB → 503 fail-closed; dev/mock → warning + permite.
- **Fail-closed rate-limit**: `_db_rate_check` con logging; prod 503, dev permite.
  `_db_rate_record` best-effort con warning (nunca tumba logins).
- **Throttle OTP**: solicitar 5/15min + verificar 10/10min (memoria + PG).
- **Soft-delete en lecturas**: búsqueda/detalle/`users_map`/métricas excluyen
  dueño eliminado (404 directo salvo ADMIN; cola de moderación los conserva).
- **Migración 010** (`db/migrations/010_fk_cascade_and_sequences.sql`): FK
  `ON DELETE (SET NULL|CASCADE)` alineadas a modelos + `setval` de secuencias
  en `seed.sql`. **Aplicar el 010 en Supabase SQL Editor antes del deploy.**
- **Purga**: `ColdStartSkeleton.jsx`, `useDebounce.js(+test)`, `PublicacionOut`,
  `PaginatedResponse`, imports huérfanos (`List/sa_delete/Response/require_arrendador`,
  `List/Optional` admin, `_jwt` en `_registrar_sesion`); eliminado `_jti_revocado`
  fail-open (reemplazado por el central).
- **Frontend**: `AuthContext` memoizado (`refresh` estable), `Authorization` en
  Detalle/Favoritos/Comparar (dueño ve su PENDIENTE).

## 7. V15.2 — Marketplace, auto-moderación y workspace arrendador (2026-09)

- **Refactor M1**: `_gate_escritura` (publicar), `_sanitizar_cambios_perfil` (DB+mock),
  `_verificar_jwt_google` (callback) + docstrings Google Style. Sin cambios de
  comportamiento (suites como red).
- **DTOs**: `DetailOut` += `usuario_id`, `created_at/updated_at`, `vistas`,
  `imagenes[{id,url,orden}]`; `CardOut` += frescura + `vistas`.
- **Dueño**: `PATCH /{id}/estado` (ACTIVO<->PAUSADO, nunca desde PENDIENTE),
  `DELETE /upload/{foto_id}`, `PATCH /upload/orden` (temporal anti-UNIQUE),
  `POST /upload/una` + `POST /upload/vincular`, `GET /{id}/similares`,
  `POST /{id}/vista` (dedup SHA256 IP+día + throttle 120/min).
- **Auto-moderación**: `services/auto_moderation.py` (reglas + `HeuristicAIModerator`,
  flag `moderacion_automatica=false`); hook en publish (no-op con flag OFF).
  Settings nuevas + fix false-200 del PATCH; bulk approve/reject + `GET /auditoria`.
- **Migración 011** (vistas + vistas_dedup). **Aplicar 010 y 011 en Supabase.**
- **Frontend**: `constants.js` (límites únicos), contadores + `maxLength` + colores,
  spinners, botón dueño en Detalle, fotos en modal, switch + vistas en MisPub,
  banner inactivo, fallback 404 con cortesía, badge "Desactualizada" derivado.
