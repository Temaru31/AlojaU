"""Chatbot AlojaU (MVP solo lectura): consultas sobre vistas chat_v_* (mig 021).

REGLAS INVIOLABLES DE ESTE MÓDULO (verificadas por tests/seguridad/chat/):
- Solo `select()` sobre las vistas `chat_v_*`. NUNCA `text()`, ni `execute()`
  con strings, ni DML (`insert/update/delete`), ni `session.add/commit/flush`.
- NUNCA importar `app.repositories.*`, servicios de escritura, ni la sesión
  principal (`app.db.session`). La sesión la inyecta el llamador y SIEMPRE es
  la del rol `chatbot_ro` (`app.db.chat_session.get_chat_session`).
- Reutilizables aquí SOLO lógica pura: `tokenize_query` (search), y en Fase 2
  `build_card`, `calcular_indice`, `haversine` (cálculos sin E/S).
- Sin PII: las vistas no exponen teléfono/correo/filas de reportes; este
  módulo no inventa ni reexpide nada fuera de las vistas.
"""
