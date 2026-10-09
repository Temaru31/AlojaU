# Chatbot AlojaU (MVP solo lectura)

> Asistente conversacional para estudiantes/visitantes: buscar, filtrar y
> comprender vivienda + usar la plataforma. **Refuerza Buscar → Filtrar →
> Comprender → Confiar → Contactar; no decide por el usuario.** Fases 1–3
> implementadas (2026-10-09). Apagado por defecto (`CHAT_ENABLED=false`).

## 1. Arquitectura

```
Visitante/estudiante
  → ChatWidget (lazy, texto plano, sin localStorage)
  → POST /api/chat {mensaje ≤500, historial ≤32, conversacion_id?}
  → throttle IP/usuario + tope diario + breaker → sesión chatbot_ro
  → orquestador (≤3 iters) → tools (vistas chat_v_*) → Fake|HTTP LLM
  → filtro salida → {respuesta, tarjetas, acciones_sugeridas} (server-side)
```

- **Auth opcional**: con JWT válido solo da identidad para rate-limit; las
  tools siempre ven lo público (visitante). Token malo = anónimo (no 401).
- **Kill switch**: `CHAT_ENABLED=false` o sin `CHAT_DATABASE_URL` = respuesta
  controlada SIN LLM ni BD (test: proveedor con 0 llamadas). El front oculta
  el widget si `chat_enabled` (de `/config-publica`) es false, y siempre en
  `/admin/*`.
- **Búsqueda normal desacoplada**: ningún router existente importa el bot.

## 2. Capa de datos (Fase 1, mig 021)

- Rol `chatbot_ro` (NOLOGIN hasta paso manual): `CONNECTION LIMIT 5`,
  `statement_timeout 3s`, `default_transaction_read_only=on`, `USAGE` +
  `SELECT` solo sobre 9 vistas `chat_v_*` (+ `REVOKE` resto; tablas nuevas
  niegan por defecto en PG15+).
- Vistas `security_barrier` con `WHERE estado='ACTIVO'` + dueño no eliminado
  cocidos: `chat_v_publicaciones` (21 cols: datos del aviso + `tiene_telefono`
  bool, `num_fotos`, `num_reportes_activos`; **sin** teléfono/correo/filas de
  reportes), `chat_v_publicacion_servicios`, `chat_v_publicacion_campus`,
  `chat_v_imagenes`, `chat_v_campus/ciudades/zonas/housing_types/servicios`.
- `app/db/chat_session.py`: engine separado (pool 2+3, NullPool en pytest);
  sin DSN = 503 fail-closed, nunca cae a la principal.
- `services/chat/readonly_queries.py`: solo `select()` parametrizado (+FTS ES
  con fallback ILIKE-OR como el repo); reutiliza solo lógica pura
  (`tokenize_query`; en tools: `calcular_indice`, `faq`).
- Test estático AST (`tests/seguridad/chat/`): prohíbe en `services/chat/` y
  `routers/chat.py` repos/sesión principal/modelos/servicios de escritura,
  `text()`/SQL crudo, DML, `eval/exec/subprocess/os/env`, y red salvo
  `llm.py` (egreso al proveedor con URL fija de settings).

## 3. Tools (allowlist cerrada, `extra="forbid"`)

`buscar_publicaciones` (≤5, textos ≤600/300), `obtener_publicacion` (404
neutro), `listar_catalogos`, `explicar_indice_confianza` (+disclaimer),
`buscar_en_faq` (9 docs `kb/*.md`, keywords en memoria, $0). Todo argumento
del LLM se revalida; lo desconocido/inválido se rechaza sin efectos (evento
sin contenido). Resultados al modelo: recortados + delimitados `<datos>` con
marcadores internos neutralizados.

## 4. Variables de entorno (solo dashboards/`backend/.env` gitignored)

| Var | Default | Qué hace |
|---|---|---|
| `CHAT_ENABLED` | `false` | Kill switch |
| `CHAT_DATABASE_URL` | `""` | `postgresql+asyncpg://chatbot_ro.<ref>:<secreto>@<pooler>:5432/postgres` (password vía `ALTER ROLE ... LOGIN` manual en SQL Editor) |
| `CHAT_LLM_PROVIDER` | `fake` | `fake` (determinista, tests) u OpenAI-compatible por urllib |
| `CHAT_LLM_BASE_URL` / `_API_KEY` / `_MODEL` | `""` | Ej. base Groq + modelo; sin las 3 → Fake |
| `CHAT_TIMEOUT_S` / `CHAT_MAX_TOKENS_SALIDA` | `20.0` / `600` | Cotas del proveedor |
| `CHAT_LIMITE_IP_MIN` / `_USUARIO_MIN` / `CHAT_TOPE_DIARIO` | `30` / `60` / `2000` | Abuso (ventana 60 s / día global + breaker) |

IP real: misma regla que auth (X-Forwarded-For validada → X-Real-IP →
client.host; basura no abre buckets). Ver `services/chat/net.py`.

## 5. Política de datos

- **No se guardan conversaciones** (ni BD ni localStorage). Rate-limit en
  memoria (ip/id + contador diario).
- Al proveedor LLM viaja: system prompt (sin secretos), últimos ≤8 turnos y
  resultados recortados de tools (datos públicos). No viajan: tokens,
  claves, PII, historial completo.
- Logs: `request_id`, longitudes, tools, latencia, resultado. Sin texto ni
  PII (`logseguro`). Widget y `/privacidad` avisan no compartir sensibles.
- Versión de política legal intacta (`v1.0-ley1581-2026`): el aviso del
  chatbot vive como sección aparte en `/privacidad`, no en el texto
  versionado de consentimiento.

## 6. Probar localmente (Fake, sin llave)

```bash
# 1. PG con schema+migraciones+seed (docker o scripts/verify_ci.sh)
# 2. backend/.env: CHAT_ENABLED=true
#    CHAT_DATABASE_URL=postgresql+asyncpg://alojau:alojau123@localhost:5432/alojau
#    (en dev puedes apuntar al superuser local; en prod SOLO chatbot_ro)
# 3. uvicorn app.main:app --port 8000
curl -X POST localhost:8000/api/chat -H 'Content-Type: application/json' \
  -d '{"mensaje":"busco habitación barata"}' | jq '{respuesta, tarjetas: (.tarjetas|length)}'
# 4. frontend/.env: VITE_API_URL=http://localhost:8000; npm run dev
#    (el widget aparece porque /config-publica trae chat_enabled=true)
# Proveedor real: define las 4 CHAT_LLM_* y prueba tú (E2E manual pendiente).
```

Tests: `pytest tests/test_chat_capa_datos.py tests/test_chat_tools.py
tests/test_chat_endpoint.py tests/seguridad/chat/ -q` (PG: 40 passed;
sin PG: archivo+estáticos en verde, integración en skip) y
`npm run test:run -- src/components/ChatWidget.test.jsx` (8 passed).

## 7. Decisiones tomadas

- Sin dependencias nuevas (urllib stdlib; `lucide-react` ya estaba).
- Todos como visitante (más simple y seguro que heredar visibilidad por rol).
- Acciones deterministas server-side (no las propone el modelo).
- `security_barrier` exige superuser al crear vistas (initdb/CI/Supabase lo son).
- Tokenizer parte en tildes: FTS con tokens normalizados + fallback ILIKE-OR.
- Feedback útil/no útil fuera del MVP (persistirlo sería escritura).

## 8. Roadmap v2/v3 (NO hacer ahora)

Crear alertas, reportar o favoritos desde el bot; asistente de
arrendador/admin; contactar propietarios; persistencia de conversaciones
(requiere migración + actualizar `/privacidad`); Telegram; embeddings/vector
DB; proveedor con herramientas de escritura (prohibido por diseño). **Regla
permanente**: las escrituras futuras van en el frontend con confirmación del
usuario y su propio token; el bot sigue read-only para siempre.
