# Chatbot AlojaU — registro completo (MVP solo lectura)

> Asistente conversacional para estudiantes/visitantes: buscar, filtrar y
> comprender vivienda + usar la plataforma. **Refuerza Buscar → Filtrar →
> Comprender → Confiar → Contactar; no decide por el usuario.**
> Estado: Fases 1–4 terminadas el 2026-10-09, **apagado por defecto**
> (`CHAT_ENABLED=false`), **sin push** (5 commits locales sobre `a54eed3`).

## 0. Ficha de control

| Campo | Valor |
|---|---|
| Commits (sobre `a54eed3`) | `30a4857` F1 datos · `eb7826a` fix DSN tests · `3007079` F2 backend · `739f6ee` F3 frontend · `2c30131` F4 docs (+ este archivo ampliado, sin commitear aún) |
| Archivos | 43 (+4238 / −1). Ver §1 por fase |
| Push / deploy | No. Orden de activación en §7 |
| Proveedor LLM | Solo `FakeLLMProvider` en código/tests. E2E real la hace el operador con su llave (nunca pedida ni guardada en repo) |
| Verificación | Backend chat 40 passed 0 skipped (PG16); suite completa 519 passed + coverage 72.38% (gate 70 OK); frontend 615/615 (92 archivos); build OK; oxlint 0 errores |

## 1. Qué se hizo, por fase

### Fase 1 — capa de datos de solo lectura (`30a4857` + `eb7826a`)

| Archivo | Cambio |
|---|---|
| `backend/db/migrations/021_chatbot_readonly.sql` (nuevo, 210 lín) | Bloque 0: pre-chequeo 005–020 + `vistas_dedup`/FKs (aborta con mensaje claro si falta algo). Bloque 1: rol `chatbot_ro` (NOLOGIN, `CONNECTION LIMIT 5`, `statement_timeout 3s`, `default_transaction_read_only=on`). Bloque 2: 9 vistas `chat_v_*` con `security_barrier` (solo `ACTIVO` + dueño vivo; trust como `tiene_telefono` bool, `num_fotos`, `num_reportes_activos` PENDIENTE/CONFIRMADO; sin teléfono/correo/filas de reportes). Bloque 3: `REVOKE` todo + `GRANT SELECT` solo en vistas. Downgrade + paso manual `LOGIN`/password + URL del pooler documentados |
| `backend/alembic/versions/021_chatbot_readonly.py` (nuevo) | Espejo (encadena `020→021`, pre-chequeo por código, upgrade/downgrade) |
| `backend/db/schema.sql` | Mismo bloque espejado (verificado byte-exacto contra la migración) |
| `backend/app/db/chat_session.py` (nuevo) | Engine/sesión separados (pool 2+3, `NullPool` en pytest); sin `CHAT_DATABASE_URL` = 503 fail-closed; no importa la sesión principal |
| `backend/app/core/config.py` | `CHAT_ENABLED=false` + `CHAT_DATABASE_URL=""` + propiedad `chat_configurado` |
| `backend/.env.example` | Bloque CHAT comentado (Fase 2 añadió el bloque LLM) |
| `backend/app/services/chat/__init__.py` + `readonly_queries.py` (nuevos) | Solo `select()` sobre vistas (filtros, FTS ES con fallback ILIKE-OR, campus/distancia, fotos, servicios, catálogos); topes duros; reutiliza solo `tokenize_query` (+ en F2: `calcular_indice`, `faq`) |
| `backend/tests/test_chat_capa_datos.py` (nuevo) | Permisos del rol (`SET ROLE`: SELECT ×9 vistas; INSERT/UPDATE/DELETE/DDL/tablas base denegados), `rolconfig`, PII en vistas vía `information_schema`, solo-ACTIVO, portada ordenada, re-aplicación idempotente, consistencia migración/espejo/schema, `chat_session` y `config` sin PG |
| `backend/tests/seguridad/chat/` (nuevo: `__init__` + `test_chat_estatico.py`) | AST anti-escritura/ejecución/env/red (cubre `services/chat/` y `routers/chat.py`) |

Hallazgos F1 (resueltos): asyncpg no entiende esquema `+asyncpg` (los tests convertían mal el DSN y quedaban en skip en CI → fix `eb7826a`); el tokenizer parte en tildes (`habitación`→`habitaci`: FTS con tokens normalizados + fallback ILIKE-OR); `set.add()` disparaba el AST (solo `sesion.add` cuenta); doble LISTEN en 5432 (PG17 nativo vs Docker → tests contra contenedor `alojau_test:5433`, borrar con `docker rm -f alojau_test`).

### Fase 2 — backend funcional (`3007079`)

| Archivo | Cambio |
|---|---|
| `services/chat/schemas.py` (nuevo) | `ChatIn` (mensaje ≤500, historial ≤32 solo `user`/`assistant`) / `ChatOut` + 5 esquemas de tools (`extra="forbid"`, rangos, literales) + `TOOLS_ALLOWLIST` |
| `services/chat/tools.py` (nuevo) | `ejecutar_tool` (allowlist + Pydantic, rechazo sin efectos); salida recortada (≤5 resultados, textos ≤600/300, portada) con `calcular_indice` desde insumos públicos |
| `services/chat/orchestrator.py` (nuevo) | Bucle tools máx. 3; resultados delimitados `<datos>` con marcadores neutralizados; tarjetas/acciones **server-side** solo de resultados del turno (máx. 3, rutas en allowlist + `/publicacion/:id` validado); filtro anti `<script>`/`javascript:`/URLs externas/emails/teléfonos/`sk-`/JWT/eco del prompt; fallback controlado, nunca lanza |
| `services/chat/llm.py` (nuevo) | `LLMProvider` + `FakeLLMProvider` (heurística + guion inyectable, contador) + `HttpLLMProvider` OpenAI-compatible por urllib (llave solo en header, URL fija de settings, llamada con `to_thread` + timeout) |
| `services/chat/prompts.py` (nuevo) | System prompt v1 (sin secretos) + delimitadores + fallbacks |
| `services/chat/kb/*.md` + `faq.py` (nuevos) | 9 docs de usuario final + retrieval por keywords en memoria ($0) |
| `services/chat/net.py` + `throttle.py` (nuevos) | IP real tras proxy (réplica pura de auth, basura no abre buckets) + throttle IP/usuario, tope diario global y circuit breaker en memoria |
| `app/routers/chat.py` (nuevo) | `POST /api/chat`: kill switch primero (200 controlado sin LLM/BD), breaker/tope diario, auth opcional **solo p/rate-limit** (`core.security`, sin importar `routers/auth`; tools siempre visitante), sesión separada, timeout, logs solo metadata con `logseguro` |
| `app/main.py`, `routers/publicaciones.py`, `core/config.py`, `.env.example` | Registro del router; `chat_enabled` en `/config-publica`; 9 vars `CHAT_*` documentadas |
| `tests/test_chat_tools.py`, `test_chat_endpoint.py`, `seguridad/chat/test_chat_seguridad.py` (nuevos) | 21 tests: rechazos, parametrización, flujo Fake, 429 antes de BD, apagado sin toques (`llamadas==0`), allowlist/inyección SQL, inyección vía descripción sembrada, historial, salida, visibilidad no-ACTIVO, kill switch, logs, llave en header |

### Fase 3 — frontend (`739f6ee`)

| Archivo | Cambio |
|---|---|
| `frontend/src/components/ChatWidget.jsx` (nuevo, lazy) | FAB `MessageCircle`; diálogo con `useFocusTrap` + Escape + `aria`; saludo que se identifica como automático + aviso de sensibles; tarjetas compactas (`formatCOP`, distancia, `BadgeConfianza`, `Link`); acciones con `navigate`; historial local (8, sin localStorage); **texto plano**; 429/error/reintento/deshabilitado; oculto en `/admin/*` y si `chat_enabled=false`; POST sin retry |
| `ChatWidget.test.jsx` (nuevo, 8 tests) | Oculto apagado/admin, apertura+bienvenida, envío con tarjetas/acciones, 429, error+reintento, HTML como texto (sin `<script>`), Escape |
| `App.jsx`, `pages/Privacidad.jsx` | Montaje lazy tras `</main>`; sección de aviso del chatbot (**texto legal `v1.0-ley1581-2026` intacto**) |

### Fase 4 — docs (`2c30131` + esta ampliación)

`docs/CHATBOT.md` (este archivo), tabla CHAT_* + orden de activación en `DESPLIEGUE.md:6`, sección en `README.md`, bitácora en `HISTORICO_Y_CONTEXTO.md`, `CONTEXTO.md` (§9 + §10).

## 2. Arquitectura (resumen operativo)

```
Widget (lazy, texto plano) → POST /api/chat → throttle+breaker → sesión chatbot_ro
→ orquestador (≤3) → tools (vistas) → Fake|HTTP LLM → filtro → {respuesta, tarjetas, acciones}
```

## 3. Seguridad (reglas → dónde se cumplen)

- Cero escritura: vistas + rol + `read_only` + test AST (`services/chat/`, `routers/chat.py`).
- Cero SQL del modelo: Pydantic `forbid` + `select()` parametrizado; test con `'; DROP` (parametriza sin efectos).
- Cero ejecución/sistema: sin `eval/subprocess/red` salvo `llm.py→proveedor` (URL fija); test AST + test de header/URL.
- Salida controlada: tarjetas/acciones server-side + allowlist + purga; front sin HTML.
- Inyección: bloques DATOS + neutralización + prompt sin secretos; test con fila sembrada.
- Privilegios: todos visitante; rate-limit IP/usuario/diario + breaker; kill switch; logs sin PII.

## 4. Variables (`backend/.env` gitignored o dashboards, nunca repo/chat)

`CHAT_ENABLED=false` · `CHAT_DATABASE_URL` (`chatbot_ro.<ref>:<secreto>@pooler:5432/postgres`, password vía `ALTER ROLE ... LOGIN` manual) · `CHAT_LLM_PROVIDER=fake` · `CHAT_LLM_BASE_URL/_API_KEY/_MODEL` (vacías = Fake) · `CHAT_TIMEOUT_S=20` · `CHAT_MAX_TOKENS_SALIDA=600` · `CHAT_LIMITE_IP_MIN=30` · `CHAT_LIMITE_USUARIO_MIN=60` · `CHAT_TOPE_DIARIO=2000`.

## 5. Política de datos

Sin persistencia de conversaciones (ni BD ni localStorage); rate-limit en memoria. Al proveedor viajan: prompt sin secretos, ≤8 turnos y resultados públicos recortados. Logs: `request_id`, longitudes, tools, latencia, resultado. Widget y `/privacidad` avisan no compartir sensibles.

## 6. Probar (Fake, sin llave)

```bash
# backend/.env: CHAT_ENABLED=true + CHAT_DATABASE_URL local; uvicorn :8000
curl -X POST localhost:8000/api/chat -H 'Content-Type: application/json' \
  -d '{"mensaje":"busco habitación barata"}'
# frontend: VITE_API_URL=http://localhost:8000, npm run dev (widget visible)
pytest tests/test_chat_capa_datos.py tests/test_chat_tools.py tests/test_chat_endpoint.py tests/seguridad/chat/ -q
npm run test:run -- src/components/ChatWidget.test.jsx
```
E2E con proveedor real: la hace el operador con su llave (definir las 4 `CHAT_LLM_*`).

## 7. Activación en prod (orden estricto, sin deploy hasta verificar rol)

1. SQL Editor: migraciones pendientes + `021` (verificar pre-chequeo 005–020).
2. `ALTER ROLE chatbot_ro WITH LOGIN PASSWORD '<secreto>'` (superuser, una vez).
3. `CHAT_DATABASE_URL` (+ `CHAT_LLM_*`) en Render; `CHAT_ENABLED=true` al final.
4. Verificar `POST /api/chat` + widget. Sin DSN el bot responde deshabilitado.

## 8. Roadmap v2/v3 (no hacer)

Alertas/reportes/favoritos desde el bot, asistente arrendador/admin, contactar, persistencia (requiere migración + `/privacidad`), Telegram, embeddings, proveedor con escritura (prohibido). **Regla permanente**: escrituras en el frontend con confirmación y token del usuario; el bot sigue read-only.
