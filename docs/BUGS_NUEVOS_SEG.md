# BUGS Nuevos Seguridad - SEC-rls-verify (2026-09-09, rama feature/SEC-rls-verify)

> Alcance: verificación RLS PROD (11 tablas ENABLE RLS + policies). Backend owner
> asyncpg bypassa RLS por diseño (sin FORCE RLS). Estos hallazgos son **adicionales**
> a RLS y no estaban en `docs/DESPLIEGUE.md §10` ni `SECURITY.md` previo.

## Resumen

- Arregladas (<=3 líneas, config): 1 (doble check ENV en mock + validator fail-closed prod)
- Documentadas (requieren >3 líneas / lógica negocio, no tocadas): 5

---

## [ARREGLADA] SEC-01 - Mock aceptado si solo uno de ENV/settings indica prod

- **Severidad:** Media
- **Evidencia:**
  - `backend/app/core/security.py:36` antes: `if settings.USE_MOCK_FALLBACK and os.getenv("ENV")!="prod"`
  - `backend/app/core/config.py:8` no tenía campo `ENV`, solo `os.getenv` en validator SECRET.
  - Mismatch posible: `Settings(ENV="prod")` con `os.getenv=dev` (o viceversa) aceptaba `mock-token-arrendador`.
- **Remediation aplicada (2 ficheros, <=3 líneas c/u):**
  - `config.py`: añadido `ENV: str="dev"` + `check_env` + `model_validator fail_closed_prod` (no arranca en prod con SECRET default/corto, `USE_MOCK_FALLBACK=True` o `CORS=*`).
  - `security.py:36-38`: `if settings.USE_MOCK_FALLBACK and getattr(settings,"ENV")!="prod" and os.getenv("ENV")!="prod"`
- **Tarea:** N/A (hecho en esta rama + test `test_prod_mock_401`).
- **Verificación:** `PYTHONPATH=backend python3 -m pytest backend/tests/test_prod_rls.py -q` 3 passed; `backend/tests -q` 50 passed.

---

## [DOCUMENTADA] SEC-02 - Auth mock-only, sin DB (login/register no usan Supabase)

- **Severidad:** Alta
- **Evidencia:**
  - `backend/app/routers/auth.py:9-11` `MOCK_USERS={"arrendador@alojau.com": hash("AlojaU123"), "admin@alojau.com": hash("Admin123")}`
  - `auth.py:23-27` `register` retorna `{"id":99,"mock":True}` sin persistir, sin validar duplicado en DB.
  - `auth.py:29-35` `login` solo busca en `MOCK_USERS`, nunca `SELECT usuarios WHERE email`.
  - Usuarios reales creados en Supabase `usuarios` no pueden loguear; solo 2 hardcoded pueden.
- **Remediation propuesta:**
  1. `login`: `SELECT Usuario WHERE email`, `verify_password`, `create_token({"sub":email,"rol":u.rol,"id":u.id})`; 401 genérico (no enumerar).
  2. `register`: validar `telefono_whatsapp` formato `chk_telefono_formato`, `hash_password`, `INSERT usuarios ROL=ARRENDADOR`, 409 si email existe.
  3. Eliminar `MOCK_USERS` y credenciales de `docs/HISTORICO_Y_CONTEXTO.md:23,62`.
- **Tarea:** `TODO(SEC-02): migrar auth a DB + tests login DB + eliminar demo creds` (estimación M, Sprint2, responsable Backend).

## [DOCUMENTADA] SEC-03 - Detalle expone PENDIENTE/otros estados a anon (incoherente con RLS solo ACTIVO)

- **Severidad:** Media-Alta (divulgación + enumeración)
- **Evidencia:**
  - RLS PROD: `publicaciones` policy `USING(estado='ACTIVO') FOR SELECT TO anon` (anon directo ve `[]` para PENDIENTE - verificado en `SECURITY.md §2.2`).
  - Backend owner bypassa RLS + `backend/app/routers/publicaciones.py:296-349` `GET /{pub_id}` sin auth retorna cualquier `estado` (DB o mock). Mock `id=3 PENDIENTE` retorna 200.
  - Tests actuales exigen 200 para PENDIENTE: `backend/tests/test_api.py:30-33`, `test_hu_sprint1.py:137-158`.
  - Atacante anon puede enumerar `/{id}` 1..1M y cosechar PENDIENTE/RECHAZADO + `telefono_whatsapp` si verificado.
- **Remediation propuesta:**
  - En `get_publicacion` tras `db.get`: `if p.estado!="ACTIVO":` exigir `get_current_user` owner (`p.usuario_id==user.id`) o `ADMIN`, si no `404` (no `403` para no confirmar existencia).
  - Igual para fallback mock. Actualizar tests `test_detalle_no_activo` a `404` para anon + `200` para owner.
- **Tarea:** `TODO(SEC-03): filtrar detalle por estado + auth owner/admin` (estimación S, Sprint2, Backend). No se fixea aquí para no romper HU-003 C3 ni lógica negocio sin PO.

## [DOCUMENTADA] SEC-04 - Fallback mock en prod oculta outage y devuelve PII falsa

- **Severidad:** Media (integridad + disponibilidad)
- **Evidencia:**
  - `publicaciones.py:270-293` (`list`), `:341-349` (`detail`), `:424-444` (`create` append a `MOCK_PUBS` global), `campus.py:22-24` (`return MOCK_CAMPUS` en `except: pass`).
  - Cualquier `Exception` DB (credenciales, RLS mal configurado, pool caído) retorna `200` con datos mock (`573001234567`, `Pandiguando`) en vez de `5xx`. En prod con `ENV=prod` sigue ocurriendo (solo mock *tokens* están bloqueados, no mock *datos*).
  - `crear_publicacion` mock muta lista global en memoria (race + leak entre workers, IDs `10000+` colisionan tras restart).
- **Remediation propuesta:**
  - Helper `is_prod()` (`settings.ENV=="prod" or os.getenv=="prod"`): en `except`, si prod `raise HTTPException(503, "DB no disponible")` + `logger.error` (ya existe), si dev/test fallback mock.
  - Añadir `Retry-After` + métrica `health/db` para Render.
- **Tarea:** `TODO(SEC-04): fail-closed 503 en prod para los 4 fallbacks` (estimación S, Backend). No se fixea aquí (4 sitios >3 líneas + cambia contrato API).

## [DOCUMENTADA] SEC-05 - Credenciales demo en repo + password sin política + sin rate-limit + JWT sin revocación

- **Severidad:** Media (fuerza bruta) / Baja (JWT)
- **Evidencia:**
  - `auth.py:9-10,15,21` passwords `AlojaU123`/`Admin123` en código + `docs/HISTORICO_Y_CONTEXTO.md:23` + `RegisterIn.password: str` sin `min_length`, sin complejidad.
  - Sin `slowapi`/limiter en `login`/`register` (`grep -r limiter backend/` vacío).
  - `security.py:11-13` `create_token` usa `datetime.utcnow()+8h`, sin `iat`/`jti`, sin deny-list; rotación `SECRET_KEY` invalida todo (ver `DESPLIEGUE.md:193`).
- **Remediation propuesta:**
  1. `RegisterIn/LoginIn: password: Field(min_length=8, max_length=72)` + mensaje ES; bloquear `AlojaU123`/`Admin123` en prod seed.
  2. `slowapi`: `5/min` por IP en `/api/auth/*`, `429` + log.
  3. JWT: añadir `iat`, `jti=uuid4`, tabla `revocados` o rotación con `kid`; documentar rotación sin downtime.
  4. Borrar credenciales demo de docs, usar usuarios de prueba solo en `seed.sql` local.
- **Tarea:** `TODO(SEC-05): política password + rate-limit + JWT jti` (estimación M, Sprint2, Backend).

## [DOCUMENTADA] SEC-06 - Uploads en disco efímero + validación solo por content-type cliente

- **Severidad:** Baja (DoS disco + bypass tipo)
- **Evidencia:**
  - `backend/app/routers/uploads.py:16-23,25-38` `UPLOAD_DIR=backend/uploads` (en `.gitignore`, efímero en Render Free), `ALLOWED_TYPES` + `file.content_type` (controlado por cliente) + fallback a `.jpg`.
  - Checks buenos: `3-10` ficheros, `5MB` c/u, `uuid.hex` + `abspath.startswith` anti-traversal, `require_arrendador`.
  - Falta: verificación magic bytes (`PIL.Image.verify`/`filetype`), límite total, antivirus, CDN persistente.
- **Remediation propuesta:** migrar a Supabase Storage/S3 con URL firmada, validar `PIL` + `imghdr`, `MAX_TOTAL=30MB`, job limpieza huérfanos.
- **Tarea:** `TODO(SEC-06): storage persistente + validación magic bytes` (estimación M, Sprint3, Backend/Infra).

---

## Verificación RLS coherente

- **Sí, coherente:** backend owner `asyncpg` (`session.py:11-28`, `_normalize_supabase_url` + `ssl=require`, pool `5/15`) bypassa RLS; repo sin `FORCE RLS`/`POLICY`/`anon key` (`grep` 0 hits); `schema.sql` sin RLS (RLS solo en PROD vía SQL Editor, correcto); `render.yaml:22-25` ya tenía `ENV=prod`+`USE_MOCK_FALLBACK=False`; `.env.example` ahora lo documenta; `config.py` fail-closed impide arrancar mal configurado.
- **Condición:** nunca añadir `FORCE RLS` ni cambiar `DATABASE_URL` a rol `anon`/`authenticated` sin reescribir backend con `SET ROLE`/`JWT Supabase`.
