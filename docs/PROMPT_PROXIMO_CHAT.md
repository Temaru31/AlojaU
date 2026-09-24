# PROMPT PROXIMO CHAT — AlojaU (actualizado 2026-09-24: portada + detalles 1-10 HECHOS)
> Rama `main` local. Suites en verde al cerrar: **pytest 284 +1 skipped, vitest 318**. Sin push a origin.
> Lo de abajo ya está implementado y testeado — no repetir. El siguiente sprint parte de §Pendiente.

---

## ✅ BUG #1 — Portada persistente (HECHO 2026-09-24)
- `order_by(ImagenPublicacion.orden)` en la relationship (`models/__init__.py`) + orden defensivo en `build_card/build_detail` (`services/publicacion_view.py:_ordenadas`): `fotos[0]` = portada en los 7 eager-loads (fetch_page, detail, mias, pendientes, cambiar-estado, similares, editar).
- `mock_to_out` simula `imagenes[{id: pub*1000+i, url, orden: i}]` (antes `[]`).
- Mock fallback en `DELETE /upload/{id}`, `PATCH /upload/orden`, `POST /upload/vincular` (ids virtuales `pub*1000+i`).
- Helper FE `src/utils/portada.js` (`portadaUrl/fotosOrdenadas/imagenesOrdenadas`) usado en Card/Favoritos/Comparar/MisPublicaciones/Detalle+GaleriaFotos.
- Tests: `backend/tests/test_portada_y_detalles.py` (reordenar→detalle `imagenes[0].id==portada_id` y `fotos[0]==portada`; ciclo mock completo) + `portada.test.js` + `CardPortada.test.jsx`.

## ✅ DETALLES 1-10 (HECHOS 2026-09-24)
1. ~~Bulk sin democión~~ → `_bulk_cambiar_estado` evalúa `evaluar_democion` por dueño en la misma txn, retorna `democionados[]` + test bulk-reject total.
2. ~~Doble fuente Publicar~~ → `validarPublicar(form, lim=LIMITES)` exportada (fuente única) + test con límite alterado + CTA intacta.
3. ~~`dias_desactualizada` hardcodeada~~ → `GET /api/publicaciones/config-publica` (público, 1 query + fallback DEFAULTS) + `constants.js` (`fetchConfigPublica`, caché 5min, `diasDesactualizadaEfectiva`) usado en Detalle + tests.
4. ~~`vistas` en mock~~ → documentado en `mock_to_out` (mias True, lista/similares False por `vistas_visibles_publico=false`).
5. ~~`require_arrendador` +1 query~~ → caché rol 60s solo-positivo (`_ROL_CACHE`, `clear_rol_cache_for_tests`) + test.
6. ~~`dev_token` recovery~~ → test fail-closed prod (Settings prod+mock=True no arranca; `mock_enabled` False con ENV global prod).
7. ~~OTP invisible~~ → `logging.basicConfig(INFO)` en `main.py` solo si ENV!=prod.
8. ~~Onboarding Google sin teléfono~~ → CTA a `/perfil#datos` ("Datos y contacto"; Perfil ya soporta `#datos` vía hash) + test de href.
9. ~~`similares` propios~~ → excluye `usuario_id == base` (DB + mock) + test.
10. ~~Limpieza~~ → `decode_token_provider_agnostic` cableado en `get_current_user`; CORS sin `PUT` (sin rutas PUT) + test preflight; bcrypt directo (sin passlib) + seed/requirements + test compat seed.

## Pendiente siguiente sprint (no empezado)
- Aplicar en Supabase prod `009/010/011` (verificar `vistas_dedup` y FKs). Rotar secreto Google + token Telegram (expuestos en chat previo). Configurar `TELEGRAM_CHAT_ID` y `SUPABASE_URL` en Render + `VITE_*` en Vercel.
- Vigilar `require_arrendador` a 5.000 usuarios (si el hit-rate del caché 60s no basta: `POST /auth/refresh` con token fresco tras publicar).
- Deuda menor restante: `reglas_convivencia` max difiere (backend 1000 vs FE 2000) — alinear en próximo cambio de schema.
