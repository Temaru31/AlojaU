# Asistente virtual AlojaU (ayuda sobre la app)

> **Cambio de diseño (2026-11-18):** el asistente ya NO consulta la base de datos.
> Antes buscaba publicaciones vía vistas `chat_v_*` con un rol de solo lectura;
> eso exponía datos de la plataforma al modelo y se retiró. Ahora solo explica
> las funcionalidades de la aplicación. Apagado por defecto (`CHAT_ENABLED=false`).

## Qué hace

Responde preguntas como «¿qué hace Roomies?», «¿cómo publico un aviso?», «¿qué es
el índice de confianza?», «¿cómo creo una alerta?». Contesta empezando por la
respuesta («Roomies sirve para...») y ofrece botones para ir a la sección.

No busca ni muestra publicaciones, no ve datos de usuarios y no contacta a nadie.

## Cómo funciona

1. `POST /api/chat` valida la entrada, aplica límites (IP, usuario, tope diario).
2. `services/chat/faq.py` recupera de `services/chat/kb/*.md` los 1–2 documentos
   más relevantes (raíces de palabras, pesos: palabra clave 3, título 3, cuerpo 1).
3. Si no hay documentación relevante: respuesta fija «no tengo información sobre
   eso» **sin llamar al LLM**.
4. Si la hay: el orquestador se la entrega al modelo como bloque `<datos>` y el
   modelo solo redacta. Sin herramientas. Con `FakeLLMProvider` (sin llave) se
   responde con el primer párrafo del documento.
5. Filtro de salida (sin URLs externas, scripts, correos, teléfonos, secretos ni eco
   del prompt) y botones de navegación desde una allowlist fija de rutas.

## Garantías (verificadas en `backend/tests/seguridad/chat/`)

- El módulo no importa BD, modelos, repositorios ni SQLAlchemy.
- Sin escritura, sin ejecución de código, sin env; red solo en `llm.py`.
- Logs sin texto del mensaje ni PII.

## Mantener la base de conocimiento

Cada funcionalidad nueva = un `.md` en `backend/app/services/chat/kb/`:
título `# ...`, párrafos cortos, y al final `Palabras clave: a, b, c`. Si debe
ofrecer botón, añade su ruta en `_ACCIONES_POR_DOC` y `_RUTAS_PERMITIDAS`
(`orchestrator.py`).

## Variables

`CHAT_ENABLED`, `CHAT_LLM_PROVIDER|BASE_URL|API_KEY|MODEL`, `CHAT_TIMEOUT_S`,
`CHAT_MAX_TOKENS_SALIDA`, `CHAT_LIMITE_IP_MIN`, `CHAT_LIMITE_USUARIO_MIN`,
`CHAT_TOPE_DIARIO`. `CHAT_DATABASE_URL` ya no existe.

## Base de datos

La migración `021_chatbot_readonly` (rol `chatbot_ro` + 9 vistas `chat_v_*`) fue
reemplazada por `023_retirar_chatbot_readonly`, que elimina esos objetos
(`backend/db/migrations/023_retirar_chatbot_readonly.sql`, espejo Alembic
incluido). `schema.sql` ya no los crea. **En Supabase prod**: ejecutar la 023 en
el SQL Editor; si `chatbot_ro` tiene sesiones abiertas, cerrarlas y reintentar.
Quitar `CHAT_DATABASE_URL` de Render si existe.
