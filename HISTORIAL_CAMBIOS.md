# AlojaU — Historial de Cambios (Release M1–M7 + Panel Admin)

> Bitácora de release. Rama `main`. Commits incluidos: `5dd5638` (sesión/UX/moderación)
> y `b7e6e3b` (panel admin, seguridad, responsive, historial). Suites en verde al
> cerrar: **pytest 310 +1 skipped, vitest 360, build OK**. Sin `--force` (flujo limpio).

## M1 — Cierre total de sesión + ayuda contextual
- `POST /api/auth/logout` (revoca el token actual) y `POST /api/auth/logout-all`
  (revocación global), ambos idempotentes y colgando del helper único
  `_revocar_sesiones_usuario` (también lo usa `/sesiones/revocar-todas`).
- `logout()` en `AuthContext`: revoca en BD (best-effort), limpia todas las claves
  `alojau_*`, anula el usuario y hace `location.replace('/')` (cero estados en memoria).
- Navbar decide por **usuario verificado** (no token crudo): fin del "efecto fantasma".
  Perfil resetea sus datos al perder el token.
- `InfoTooltip` híbrido (hover en desktop, tap + cierre afuera/Escape en móvil).

## M2 — Google OAuth vs contraseña + endurecimiento
- Sección de contraseña oculta si `auth_provider === 'google'` (tarjeta informativa);
  cuentas `password+google` la conservan.
- Danger zone: botón bloqueado hasta que el correo coincida letra por letra;
  sin campo de contraseña para Google (el backend nunca la exigió ahí).
- Parche del oráculo en `POST /api/reportes`: inexistente, privado/inactivo y dueño
  en soft-delete responden el **mismo 404 neutro**; solo `ACTIVO` es reportable.
- Pausar aviso y revocar-todas exigen confirmación en 2 pasos (revocar limpia sesión).
- Tags de Perfil transaccionales: viven en el formulario y se guardan con todo
  (sin PATCH inmediato), con indicador "sin guardar".

## M3 — Canal OTP explícito + insignias
- `otp/solicitar` devuelve `canal: email|telegram`; la UI nombra el canal y la
  vigencia (10 min), con cooldown de 60s anti-spam.
- Insignias verdes `✓ Correo verificado` / `✓ Teléfono verificado` en Perfil.
- Sin botón [Abrir Telegram]: el backend no conoce el username del bot y no se
  inventan URLs (decisión documentada, no deuda).

## M4 — Edición transaccional + historial (Migración 012)
- `servicios_ids` + `fotos` entran a `PublicacionUpdate`; helper
  `_reconciliar_fotos_urls` compartido: el modal bufferiza altas/bajas/portada/tags
  y commitea en **UN solo PATCH** (todo o nada). `PATCH /{id}/fotos` atómico.
- Migración **012** (aplicada en Supabase Prod antes de este release): eventos
  `SETTINGS`/`CUENTA_DELETE` + `audit.publicacion_id` NULLABLE (el CHECK real se
  llamaba `publicaciones_audit_evento_check`, no `chk_evento`: se dropean ambos).
- Settings y eliminar-cuenta dejan fila de auditoría; pestaña **Historial** en el
  panel admin (paginada, fecha 12h) y `GET /{id}/historial` solo-dueño con sección
  "Historial del inmueble" en Detalle. Etiquetas humanas en `utils/historial.js`.

## M5 — Auth unificado en `/publicar`
- Fuera el form legacy: tarjeta con `GoogleButton` + link a Mi Perfil. Retorno
  post-OAuth vía `sessionStorage` validado anti open-redirect (sin tocar URLs de
  Supabase). `AuthCallback` respeta el destino (`/publicar` por defecto `/`).

## M6 — Orden server-side + pausas distinguibles
- `?orden=recientes|vistas|estado` en `GET /mias` (DB y mock con el mismo contrato;
  ordenar en cliente mentiría con multipágina).
- Etiquetas `⏸️ Pausada por el Arrendador` vs `⚠️ Pausada por Moderación`
  (mapeadas a los estados reales; no existen `PAUSADO_MODERACION`/`BLOQUEADO`).

## M7 — Cold start 3.5s
- `API_SLOW_THRESHOLD_MS` 4000→3500: el toast "Despertando el servidor" solo aparece
  si el request lo supera; respuesta rápida lo cancela (con test de temporizador).

## Métricas y UX móvil
- Tarjeta **Usuarios** agregada a los KPIs (`/api/admin/metricas` reusado, sin
  endpoint duplicado) + tooltips en cada KPI y badge `[PENDIENTE]` veraz solo en
  `auto_aprobar_*` (setting sin consumidor verificado en código).
- Áreas táctiles 44px (switch, ×, dots, tabs, menú) vía pseudo-elemento/clases sin
  deformar layout; Comparar conserva tabla con scroll+sticky (verificado, no cards);
  spinner + `aria-busy` en ReportarModal. Contraste: dorado solo sobre oscuro.

## Notas de despliegue
- Requiere Migración 012 en Supabase Prod (ya aplicada antes de este release).
- Los JWT de 8h emitidos antes del release 2h conviven hasta su `exp`.
- Verificación pre-push: `pytest` 310+1, `vitest` 360, `npm run build` OK.
- Push limpio `git push origin main` (Render/Vercel redespliegan solos).

## 2026-09-28 — CodeQL 17 alertas a 0 + CI DB al 100% (verde total)
- **Contexto:** scan sobre `2ff4b2a` fallaba con 17 alertas nuevas (2 HIGH + 15 MEDIUM). El agente anterior usaba wrappers (`una_linea`/`exc_resumen`) que no cortan taint en CodeQL y hacía push directo a `main` sin pasar pruebas.
- **Logro:** 7 checks en verde en GitHub (CI + CodeQL), merge PR #31 (`080ed8a`), más fix CI web (`8cb149f`). `main` = `origin/main` limpio, `0 ahead/behind`. CI #67 y CodeQL #59 en Success.
- **Cambios y por qué:**
  - `frontend/src/components/Card.test.jsx:41`: `startsWith('https://a.com')` → `startsWith('https://a.com/')`. Sin slash, `https://a.com.evil.com` también coincide (Incomplete URL sanitization).
  - `backend/scripts/verificar_telegram_e2e.py:139`: `print(f"Sin password (define {ENV_PASSWORD} ...)")` → `print("Sin credencial: no se puede verificar (falta variable de entorno).")`. Evita clear-text logging de variable con nombre `password`.
  - `backend/app/routers/admin.py:241,290`, `auth.py:1334,1336,2128`, `publicaciones.py:423,492,735,864,914,997,1092,1145,1209,1279`: desinfección directa `str(v).replace('\n','').replace('\r','')` en variable previa al logger (ej. `_pub_id_seguro`, `_email_seguro`, `_proposito_seguro`, `_err_seguro`). Los wrappers no son sanitizers para CodeQL; el `.replace` directo sí. Se hace fuera del f-string por compatibilidad Python 3.11 (sin backslash en `{}`), conservando `una_linea`/`exc_resumen` + `exc_info`.
  - `.github/workflows/ci.yml` paso `Init DB schema` (vía web, commit `8cb149f`): agrega `import glob` + loop `for mig in sorted(glob.glob("db/migrations/*.sql"))`. Sin esto la CI solo aplicaba `schema.sql` y nunca ejercía migraciones 017/018 (índice + CHECK `telegram_chat_id`) → falso negativo. Replica `scripts/verify_ci.sh [2/4]`.
- **Commits:** `1a7373a` fix CodeQL (PR #31) → merge `080ed8a`; `8cb149f` fix CI web. Ramas temporales `fix/codeql-desinfeccion-directa` y `backup-ci-migrations-08ccfdc` eliminadas tras merge.
- **Validación:** `py_compile` OK, `vitest Card.test.jsx` 16 passed, `test_security.py` 27 passed, `ci.yml` YAML OK. `test_ci_fallbacks.py::test_prod_admin_y_auth_503` falla solo local sin Postgres (preexistente, no regresión).
