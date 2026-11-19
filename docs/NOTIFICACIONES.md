# Notificaciones de moderación (aprobado / rechazado)

> Objetivo: el arrendador se entera **esté o no en la app**, sin tecnicismos.

## Qué ya funciona

| Canal | Estado |
|---|---|
| Dentro de la app (Mis publicaciones) | ✅ Banner de estado + acordeón "Actividad reciente" (`GET /mias/historial`: trazabilidad con etiquetas humanas). |
| Telegram DM (esté o no en la app) | ✅ Moderación despacha vía `services/notifications` (canales extensibles) si el dueño vinculó su chat. Best-effort: jamás rompe el 200. Requiere `TELEGRAM_BOT_TOKEN`. |
| Guía para vincular Telegram | ✅ Banner sugiere vincular desde Mi Perfil cuando hay avisos en revisión y no hay vínculo. |

## Qué falta (siguiente paso)

| Canal | Diseño propuesto |
|---|---|
| Correo | El backend hoy no tiene SMTP. Opción $0: Supabase Auth email (plantillas) o un `EMAIL_*` SMTP en Render + worker que lea `PublicacionesAudit` (eventos APPROVED/REJECTED) y envíe. No implementado: requiere credenciales SMTP. |
| Push web | Futuro: Web Push (VAPID) con suscripción por usuario. Requiere tabla `push_subscriptions` + service worker. |

## Diseño a futuro (alertas de arriendo nuevo para usuarios normales)

La idea: un usuario guarda "avísame arriendos de $X–$Y cerca a campus Z" y se
entera dentro de la app (y si quiere, por correo/Telegram). El código ya deja
la puerta abierta; al implementarlo, seguir este plano para no improvisar:

1. **Eventos de dominio** (ya existe el patrón en `services/notifications.py`):
   `notificar_nuevo_arriendo(publicacion)` se emite al aprobar (ACTIVO).
2. **Búsquedas guardadas** (tabla futura `alertas_busqueda`):
   `usuario_id, filtros JSONB {precio_min, precio_max, campus_id, tipo,
   servicios}, canal_preferido (app|email|telegram), activa BOOL`.
3. **Matcher**: al emitir el evento, query de alertas activas cuyo filtro
   casa con la publicación (mismo matching que `/api/publicaciones`, Sto.
   reutilizar `repositories/publicacion_repo` en vez de duplicar SQL).
4. **Dispatcher**: por cada match, `despachar(db, usuario_id, texto,
   canales=[canal_preferido])`. Respeto total: solo si `activa` y con
   throttle (1 digest diario por usuario, no 1 mensaje por aviso).
5. **Dentro de la app**: campanita en el navbar con conteo + bandeja
   (nuevo endpoint `GET /api/notificaciones`, tabla `notificaciones`
   con `leida BOOL`). Reutiliza el lenguaje humano de `HistorialAvisos`.
6. **Telegram**: el mismo `CanalTelegram` sirve (DM al chat vinculado);
   solo hay que pedir opt-in explícito al crear la alerta (Ley 1581:
   consentimiento + enlace para desactivar en cada mensaje).
7. **Correo**: `CanalEmail` (nuevo, implementa el Protocol) con SMTP o
   Supabase; el dispatcher no cambia (esa es la gracia del diseño).

## Reglas

- Ningún aviso muestra enums crudos al dueño (`En revisión`, `Publicada`, `Rechazada`).
- Notificar es best-effort: si Telegram falla, el cambio de estado igual se guarda y el banner dentro de la app lo cubre.
- Nunca notificar a grupos/canales: solo DM al `telegram_chat_id` vinculado (privacidad M5).
