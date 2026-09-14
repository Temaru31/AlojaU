# AlojaU — Automatización Admin (v3: ajustes activos + caché)

> Estado: **Ajustes del Sistema ACTIVOS** (`GET/PATCH /api/admin/automation/settings`,
> solo `ADMIN`, caché TTL 5min con invalidación al escribir). `POST evaluar`
> implementa la pausa automática real por umbral. La tabla `system_settings`
> llega vía migración `005_admin_automation`
> (`backend/db/005_admin_automation.sql` para Supabase).

## 1. Tabla `system_settings`

| clave | tipo | default | efecto |
|---|---|---|---|
| `dias_vigencia_publicacion` | int 1..365 | `30` | vigencia al crear/renovar (hoy hardcode 30d en `create_persisted`/`renovar_publicacion`) |
| `max_reportes_para_pausa_automatica` | int 1..20 | `3` | reportes `PENDIENTE/CONFIRMADO` que disparan `PAUSADO_POR_REPORTE` |
| `auto_aprobar_arrendadores_verificados` | bool | `false` | si `true`, `POST /publicaciones` de verificados nace `ACTIVO` (hoy siempre `PENDIENTE`) |

Modelo: `app/models/__init__.py::SystemSetting` (`clave UNIQUE`, `valor TEXT`,
`tipo`, `descripcion`, `actualizado_en`). Lectura con **caché en memoria TTL
5min** (`admin_automation.py::_settings_cache`, una sola query para las 3
filas, sin N+1); escritura solo `ADMIN` con validación de tipo/rango e
**invalidación inmediata** (`clear_settings_cache()`). UI: pestaña
"⚙️ Ajustes del Sistema" en `/admin/dashboard` (numéricos + switch).

## 2. Máquina de estados (publicaciones)

```
PENDIENTE ──aprobar──▶ ACTIVO ──reportes>=umbral──▶ PAUSADO_POR_REPORTE
    │                     │  ▲                              │
    │                     │  │ reanudar                      │ revisión ok
    └────rechazar──▶ RECHAZADO                              ▼
                          │                        REVISION_REQUERIDA ──aprobar──▶ ACTIVO
                          └──expira──▶ EXPIRADO ──renovar──▶ ACTIVO
```

- **Nuevos (aditivos, no rompen los 7 previos):** `PAUSADO_POR_REPORTE`
  (auto, por umbral), `REVISION_REQUERIDA` (fotos/flag de moderación).
- `chk_estado` se amplía en la migración 005 (downgrade revierte a los 7).
- Transiciones escriben `publicaciones_audit` (`PAUSED` para pausas,
  nuevo `BLOCKED` reservado para baneos; `APPROVED/REJECTED` existentes).
- `GET /api/publicaciones` sigue mostrando **solo `ACTIVO`** (invariante);
  `GET /mias` y bandeja admin muestran todos.

### Reglas automáticas (cuando se encienda el flag)

1. **Pausa por reportes:** cron/worker `evaluar_pub(pub_id)` cuenta
   `reportes WHERE estado IN (PENDIENTE,CONFIRMADO)`; si `>= umbral`,
   `estado=PAUSADO_POR_REPORTE` + audit `PAUSED (auto, N reportes)`.
2. **Auto-aprobado verificados:** si setting `true` y
   `usuario.telefono_verificado`, `POST` crea `ACTIVO` directo + audit
   `APPROVED (auto)`. Si `false` (default), flujo actual `PENDIENTE`.
3. **Vigencia parametrizada:** `fecha_expiracion = now + dias_vigencia` en
   crear/renovar (hoy `timedelta(days=30)` fijo).

## 3. Pipeline multimedia (subida de fotos)

Orden barato→caro, fail-closed a `REVISION_REQUERIDA` (nunca se cae la subida
por un servicio externo):

1. **Local (siempre):** `services/media_moderation.py::validar_imagen_local`
   - magic-bytes (JPEG/PNG/WEBP/GIF), tope 8MB, dimensiones vía Pillow.
   - `<200px` o sin Pillow → `REVISION_REQUERIDA`, no `RECHAZADO`.
2. **Cloudinary Moderation Add-on (opcional):** `moderar_con_cloudinary(url)`
   - Requiere `CLOUDINARY_*` + add-on (AWS Rekognition/Google/manual).
   - `approved→ACTIVO`, `rejected→RECHAZADO`, `pending→REVISION_REQUERIDA`.
3. **Heurística "no relacionada" (futuro):** pHash/histograma para duplicadas,
   logos o 1x1; umbral conservador → `REVISION_REQUERIDA` con cola humana.

Integración prevista en `routers/uploads.py` (hoy local/Cloudinary según
`settings.cloudinary_configured`): llamar a `validar_imagen_local` antes de
persistir y anotar el flag en la respuesta; el hook Cloudinary corre async
post-subida.

## 4. Endpoints (activos, solo ADMIN)

| método | ruta | notas |
|---|---|---|
| GET | `/api/admin/automation/settings` | lista settings o defaults si no hay tabla (caché 5min) |
| PATCH | `/api/admin/automation/settings/{clave}` | valida int/bool + rangos, 404 si clave desconocida, invalida caché |
| POST | `/api/admin/automation/evaluar/{pub_id}` | pausa a `PAUSADO_POR_REPORTE` + audit si reportes >= umbral |

Sin token → 401, no-ADMIN → 403 (RBAC estándar, ver `test_admin_settings.py`).

## 5. Rollout sugerido

1. Aplicar `005_admin_automation.sql` en Supabase (ventana sin downtime: solo
   `CREATE TABLE` + `DROP/ADD CHECK` aditivo).
2. Encender flag en staging, probar pausa-auto con 3 reportes de prueba.
3. UI admin (fuera de este documento): tabla editable + toggle + botón
   "Evaluar ahora" por aviso + badge `PAUSADO_POR_REPORTE` en Detalle.
