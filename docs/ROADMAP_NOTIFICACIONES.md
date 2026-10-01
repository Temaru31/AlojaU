# Módulo Notificaciones In-App — Fuente de la Verdad

> Alcance cerrado: campanita + alertas de arriendo nuevo **dentro de la web**.
> Telegram/WhatsApp/correo/push quedan EXCLUIDOS de este módulo hasta nuevo
> aviso (la tabla deja la puerta abierta vía `canal`, sin lógica de despacho).

## Estado del Arte

| Fase | Contenido | Estado |
|---|---|---|
| Fase 1 | BD y modelos: `busquedas_guardadas` + `notificaciones` (DDL v2), ORM, tests | ✅ Completada y validada (backend 446/446 incl. 9 tests nuevos + cobertura POST_019) |
| Fase 2 | Matcher + endpoints (`GET /api/notificaciones`, `PATCH .../leer`, `.../leer-todas`) + enqueue al aprobar con savepoint | ⬜ Pendiente |
| Fase 3 | Frontend: campanita navbar + página Alertas (CRUD búsquedas) | ⬜ Pendiente |

## Decisiones de Arquitectura Tomadas (no reabrir sin arbitraje)

1. **DDL v2 arbitrado** (mig `019_notificaciones_y_busquedas`): FKs reales a
   `campus_universitarios`/`zonas_barrios` (`ON DELETE SET NULL`), índice
   compuesto `idx_bg_matching(activa, campus_id, tipo) WHERE activa`,
   dedupe por `evento_id` (`UNIQUE(usuario_id, evento_id)`, NO por tipo),
   `leida BOOLEAN + leida_en`, columna `canal DEFAULT 'app'` (reserva
   multicanal, costo cero). Ver `backend/db/migrations/019_*.sql`.
2. **Savepoint, no try/except pelado**: el enqueue corre dentro de
   `async with db.begin_nested()` en la transición a ACTIVO; si falla, se
   loguea y el approve sigue intacto (un error en PG aborta la TX sin
   savepoint: el try/except solo NO sirve).
3. **Dedupe por `evento_id`**, generado por el productor
   (`nuevo_arriendo:<pub_id>`, `moderacion:<pub_id>:<ts>`): reintentos seguros
   sin prohibir repeticiones futuras del mismo tipo.
4. **Purga TTL 90 días en escritura** (bloque de enqueue, `DELETE ... LIMIT 500`),
   jamás en GET (endpoints de lectura estrictamente puros; réplicas futuras).
5. **Matcher con `@>`**: `busq.servicios_ids <@ pub_servicios` (vacío = todo);
   `campus_id` contra campus autovinculados por trigger; `zona_barrio_id`
   exacto-o-NULL. Tope: 10 alertas activas por usuario (anti-abuso).
6. **Convención repo**: cada migración Alembic tiene espejo SQL en
   `db/migrations/`, tablas en `db/schema.sql` (CI inicializa PG desde ahí) e
   índices registrados en `tests/test_indices_sync.py`.

## Archivos del módulo (Fase 1)

- `backend/alembic/versions/019_notificaciones_y_busquedas.py` (upgrade + downgrade)
- `backend/db/migrations/019_notificaciones_y_busquedas.sql` (espejo para Supabase)
- `backend/db/schema.sql` (sección 13: ambas tablas + 3 índices)
- `backend/app/models/__init__.py` (`BusquedaGuardada`, `Notificacion`)
- `backend/tests/test_notificaciones_modelos.py` (ORM + CHECKs + espejo upgrade/downgrade)

## Rollback

- **Alembic**: `alembic downgrade 018_telegram_contacto` (o `downgrade -1` desde
  head): borra los 3 índices y las 2 tablas (`IF EXISTS`, no toca el resto).
- **Supabase/manual**: ejecutar el bloque `-- DOWNGRADE` de
  `db/migrations/019_notificaciones_y_busquedas.sql`.
- **Modelos**: revertir el bloque final de `app/models/__init__.py`.
- Orden inverso al aplicar; verificar con
  `pytest tests/test_notificaciones_modelos.py tests/test_indices_sync.py`.

## Notas para Fase 2 (no empezar sin leer)

- Enganchar SOLO transiciones a `ACTIVO`: `PATCH /api/admin/publicaciones/{id}`,
  `POST .../bulk-approve` y auto-moderación (`evaluar_y_aplicar`).
- Endpoints: `GET /api/notificaciones` (paginado ≤50, `solo_no_leidas`, retorna
  `no_leidas`), `PATCH /{id}/leer` (403 si ajena), `PATCH /leer-todas`.
- `GET` jamás escribe (ni purga: ya corre en el bloque de enqueue).
- Tests Fase 2: fan-out (1 aviso → N filas), dedupe por `evento_id` ante doble
  approve, 403 IDOR, `servicios @>` con caso vacío y exigente.

## Pendientes abiertos (Fase 3+)

- Campanita navbar (desktop dropdown / móvil sheet) + `useNotificaciones`
  (fetch al montar + `alojau:notificaciones-change` + intervalo 5 min visible).
- Página Alertas con CRUD de `busquedas_guardadas` (tope 10 activas/usuario).
- Futuro multicanal (FUERA DE ALCANCE): drenar por `canal` + estado de envío
  por canal (columnas nuevas, sin reescribir nada de Fase 1).
