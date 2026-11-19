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

## Cómo funciona (v4)

1. `POST /api/chat` valida la entrada y aplica límites (ver «Anti-saturación»).
2. `intencion.py` clasifica el mensaje. Saludo, identidad, agradecimiento,
   despedida, inyección, datos sensibles, acciones no permitidas y temas ajenos
   se responden con textos fijos (`respuestas.py`) **sin llamar al LLM**.
3. «Más corto», «resúmelo», «por qué tanto texto»: se resume el tema de la
   última pregunta `user` del historial (recalculado en el servidor; los turnos
   `assistant` que manda el cliente nunca se usan). «Explícame mejor» vuelve a
   pedir esa pregunta al modelo con la documentación.
4. `ortografia.py` corrige errores de escritura (distancia de edición 1, palabras
   de 5+ letras) hacia el vocabulario de la KB: «spublicar» -> «publicar».
5. `guiadas.py`: 10 temas frecuentes (publicar, Roomies, confianza, filtros,
   favoritos/comparar, alertas, recuperar contraseña, mis publicaciones,
   publicidad, perfil) se responden con texto fijo tomado de la KB, botones del
   tema y 2 preguntas sugeridas, **sin LLM**. Las preguntas de detalle («¿por
   qué...?», «¿cuántas...?») siguen al paso 6.
6. `services/chat/faq.py` recupera de `services/chat/kb/*.md` los 1–2 documentos
   más relevantes (raíces de palabras, pesos: palabra clave 3, título 3, cuerpo 1).
3. Si no hay documentación relevante: respuesta fija «no tengo información sobre
   eso» **sin llamar al LLM**.
4. Si la hay: el orquestador se la entrega al modelo como bloque `<datos>` y el
   modelo solo redacta. Sin herramientas. Con `FakeLLMProvider` (sin llave) se
   responde con el primer párrafo del documento.
7. Filtro de salida (sin URLs externas, scripts, correos, teléfonos, secretos ni eco
   del prompt), recorte a 3 frases / 400 caracteres y botones del documento
   principal desde una allowlist fija de rutas.
8. La respuesta trae `sugerencias` (opcional): preguntas que el widget muestra
   como botones y envía tal cual.

## Anti-saturación por IP

La IP sale de `ip_para_limites` (con `TRUSTED_PROXY_HOPS`), no de la primera
entrada de `X-Forwarded-For`, que el cliente puede falsificar. Por IP: ráfaga
(`CHAT_LIMITE_IP_RAFAGA` en 10 s), minuto (`CHAT_LIMITE_IP_MIN`), hora
(`CHAT_LIMITE_IP_HORA`) y peticiones simultáneas (`CHAT_MAX_EN_CURSO_IP`); 429
con `Retry-After`. El tope diario global se cuenta **después** de los límites por
IP, para que las peticiones rechazadas de una sola IP no agoten el cupo de todos.
Requisito en producción: `TRUSTED_PROXY_HOPS=1` en Render (si queda en 0, todas
las peticiones comparten la IP del proxy y el límite sería global).

## Garantías (verificadas en `backend/tests/seguridad/chat/`)

- El módulo no importa BD, modelos, repositorios ni SQLAlchemy.
- Sin escritura, sin ejecución de código, sin env; red solo en `llm.py`.
- Logs sin texto del mensaje ni PII.

## Mantener la base de conocimiento

Cada funcionalidad nueva = un `.md` en `backend/app/services/chat/kb/`:
título `# ...`, párrafos cortos, y al final `Palabras clave: a, b, c`. Si debe
ofrecer botón, añade su ruta en `_ACCIONES_POR_DOC` (`orchestrator.py`) y en
`RUTAS_PERMITIDAS` (`rutas.py`). Si es un tema frecuente, añade un `Tema` en
`guiadas.py` con texto tomado del `.md` (la prueba `test_guiadas_las_cifras_salen_de_la_kb`
verifica que las cifras coincidan) y 2 sugerencias que lleven a otro tema.

## Variables

`CHAT_ENABLED`, `CHAT_LLM_PROVIDER|BASE_URL|API_KEY|MODEL`, `CHAT_TIMEOUT_S`,
`CHAT_MAX_TOKENS_SALIDA`, `CHAT_LIMITE_IP_MIN`, `CHAT_LIMITE_IP_RAFAGA`,
`CHAT_LIMITE_IP_HORA`, `CHAT_MAX_EN_CURSO_IP`, `CHAT_LIMITE_USUARIO_MIN`,
`CHAT_TOPE_DIARIO`. `CHAT_DATABASE_URL` ya no existe. Modelo en producción:
`openai/gpt-oss-20b` (Groq); `llama-3.1-8b-instant` ya no está disponible en el
plan normal.

## Base de datos

La migración `021_chatbot_readonly` (rol `chatbot_ro` + 9 vistas `chat_v_*`) fue
reemplazada por `023_retirar_chatbot_readonly`, que elimina esos objetos
(`backend/db/migrations/023_retirar_chatbot_readonly.sql`, espejo Alembic
incluido). `schema.sql` ya no los crea. **En Supabase prod**: ejecutar la 023 en
el SQL Editor; si `chatbot_ro` tiene sesiones abiertas, cerrarlas y reintentar.
Quitar `CHAT_DATABASE_URL` de Render si existe.
