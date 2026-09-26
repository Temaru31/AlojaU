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
