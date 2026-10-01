# Módulo Notificaciones In-App — Fuente de la Verdad

> Alcance cerrado: campanita + alertas de arriendo nuevo **dentro de la web**.
> Telegram/WhatsApp/correo/push quedan EXCLUIDOS de este módulo hasta nuevo
> aviso (la tabla deja la puerta abierta vía `canal`, sin lógica de despacho).

## Estado del Arte

| Fase | Contenido | Estado |
|---|---|---|
| Fase 1 | BD y modelos: `busquedas_guardadas` + `notificaciones` (DDL v2), ORM, tests | ✅ Completada y validada (backend 446/446 incl. 9 tests nuevos + cobertura POST_019) |
| Fase 2 | Matcher + endpoints (`GET /api/notificaciones`, `PATCH .../leer`, `.../leer-todas`) + enqueue al aprobar con savepoint | ✅ Completada y validada (backend 446+/446; suites `test_notifications_matcher` 11/11 y `test_notificaciones_endpoints` 14/14) |
| Fase 3 | Frontend: campanita navbar + página Alertas (CRUD búsquedas) | ✅ Completada y validada (frontend 91/91 archivos, 592/592 tests; lint 0 errores; build OK) |

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
   exacto-o-NULL. Tope: 5 alertas activas por usuario + mínimo 1 filtro (zona/campus/precio/tipo/servicios) — endurecido anti-spam post-Fase 2.
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

## Notas de Fase 2 (implementado; leer antes de Fase 3)

- Servicio `app/services/notifications_matcher.py`: `evaluar_y_crear_notificaciones`
  con primitivas (testeable, sin flush hazards), INSERT..SELECT set-based +
  `ON CONFLICT DO NOTHING`, savepoint interno, purga TTL en escritura.
  **Nunca lanza** (retorna 0 con warning); los hooks llevan try/except propio.
- Hooks: admin `cambiar_estado` y `_bulk_cambiar_estado` (pre-commit, con
  savepoint) + `crear_publicacion` post-commit del automod (ya persistido;
  savepoint propio). Asimetría documentada y deliberada: fail-safe en ambos.
- Router `app/routers/notificaciones.py` (bandeja + busquedas), registrado en
  `main.py`. `PATCH /leer-todas` declarada ANTES de `/{id}/leer` (orden rutas).
- Semántica fijada: 1 fila por (usuario, aviso) aunque casen varias alertas
  (`busqueda_id` ilustrativa, anti-spam); `in_([])` saltado (siempre-falso);
  `contained_by` con `cardinality()==0` como comodín.
- Sin stores mock (503 honesto sin PG, precedente POST /reportes).
- Tests: `test_notifications_matcher.py` (matriz, dedupe, savepoint con canon
  basura, purga) + `test_notificaciones_endpoints.py` (contratos, IDOR 403,
  tope 10, approve→notificación, doble approve, matcher roto→approve 200).

## Notas de Fase 3 (implementado)

- `hooks/useNotificaciones.js`: bandeja + badge + marcar(optimista con
  rollback)/todas + evento `alojau:notificaciones-change` + polling 5 min
  solo visible. Sin token no pide la bandeja (regla MisPublicaciones).
- `components/Campanita.jsx`: bell + badge 99+, dropdown desktop / sheet
  móvil, Esc/backdrop/navegar cierran, clic marca y va a `/publicacion/:id`,
  footer a `/alertas`. Fail-open: sin total numérico no oculta nada.
- `pages/Alertas.jsx` + `utils/alertas.js` (`filtrosABusqueda` compartido con
  Buscar vía botón `GuardarAlerta`): crear (tope 5 con mensaje, mínimo 1 filtro), eliminar
  con ConfirmDialog. Sin `PATCH activa` a propósito (fuera del alcance
  aprobado: desactivar = eliminar).
- `App.jsx`: ruta `/alertas` (lazy) + campanita junto al avatar/hamburguesa.
- Lint: 0 errores; quedan 3 warnings `set-state-in-effect` del mismo patrón
  fetch/close que el baseline ya trae (~10 instancias preexistentes).
- Tests: `useNotificaciones` (6), `Campanita` (7), `Alertas` (8).

## Probar E2E (manual, 5 min)

1. Dev: backend con mig 019 aplicada (`alembic upgrade head` o espejo SQL),
   frontend `npm run dev`. Dos usuarios (arrendador + estudiante).
2. Estudiante → Buscar → ajusta filtros → `🔔 Guardar alerta` (toast OK) →
   `/alertas` la muestra. Sin sesión el botón lleva a `/perfil`.
3. Arrendador → Publicar → admin aprueba → campanita del estudiante con
   badge 1 → clic lleva al detalle y apaga el badge → `Marcar todas`.
4. Tope: crear 5 alertas → la 6ª bloqueada con mensaje (front + 422 back); alerta vacía → 422 con guía (front + back).
5. IDOR: PATCH leer de otro usuario → 403 (cubierto en tests).

## Despliegue a main (cuando se apruebe)

1. Merge de `feature/notificaciones-inapp` a `main` (PR, CI en verde).
2. Render hace redeploy solo del backend; Vercel del frontend.
3. Aplicar `db/migrations/019_notificaciones_y_busquedas.sql` en Supabase
   SQL Editor UNA vez (o `alembic upgrade head` donde corresponda).
4. Verificar: `GET /api/notificaciones` 401 sin token; campanita visible
   con sesión; publicar→aprobar genera fila (tabla `notificaciones`).

## Rediseño campanita (post-Fase 3, misma rama)

- Bell vectorial inline estilo lucide (sin dependencia), badge ámbar, panel
  popover desktop / sheet móvil; vacía con un solo enlace; no-leídas en
  ámbar suave; iconos por tipo; tiempo con mayúscula inicial.
- Campanita en 2 instancias (desktop junto al perfil + header móvil),
  sincronizadas por `alojau:notificaciones-change`. Desviaciones
  justificadas del brief: sin namespace `/api/v1` (convención `/api/...`),
  destino `/publicacion/:id` (la ruta es singular), sin lucide-react.
- Poll del hook a 45 s + revalidación al enfocar.
- Eventos nuevos: moderación (approve/reject/pausa, unitario+bulk+automod)
  y bienvenida Telegram (mig 020 amplía el CHECK con `'telegram'`;
  downgrade solo sin filas telegram). Helper `crear_notificacion` con
  savepoint, nunca lanza; hooks con try/except.
- Incidentes reales corregidos: CHECK duplicado por nombre autogenerado
  (020 tumba ambos nombres), `in_([])`, commit antes de contar en tests,
  e interferencia al correr ambas suites contra el mismo PG local.

## Pendientes abiertos (futuro multicanal, FUERA DE ALCANCE)
- Futuro multicanal (FUERA DE ALCANCE): drenar por `canal` + estado de envío
  por canal (columnas nuevas, sin reescribir nada de Fase 1).
