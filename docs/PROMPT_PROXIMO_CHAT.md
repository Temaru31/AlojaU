# PROMPT PROXIMO CHAT — AlojaU: fix portada + detalles pequeños (NO subir a main aún)
> Copiar desde aquí hasta el final como prompt inicial del siguiente chat.
> Rama `main` local con trabajo v13→v15.2 commiteado (ver commit `chore(v15.2): ...`).
> Suites en verde al cerrar: **pytest 271 + vitest 304**. BD local limpia (3 usuarios seed).

---

Actúa como Senior Full-Stack Engineer. Contexto: AlojaU (FastAPI + React + Supabase PG, free tiers Vercel/Render/Supabase). Tienes el repo en `/home/angel/Escritorio/AlojaU`, rama `main`, tests 100% verdes. Lee primero `docs/HISTORICO_Y_CONTEXTO.md §0-§5` y `docs/AUTH_ENTERPRISE.md §5-7`.

## REGLAS DURAS (no negociables)
1. No romper contratos JSON existentes (solo campos aditivos). No borrar código funcional. No stubs vacíos.
2. Cada fix lleva su test (pytest o vitest) y las suites deben quedar 100% verdes antes de terminar.
3. No hacer push a `origin/main` sin orden explícita. Commits locales sí.
4. Nunca pedir ni pegar secretos (Google Client Secret, Telegram token, DB passwords) en el chat.

## BUG CONFIRMADO #1 — La portada no persiste al recargar/comparar/favoritos
**Causa raíz verificada:** ningún `selectinload(ImagenPublicacion)` ordena por `orden`, así que `fotos[0]` es orden de heap, no la portada (`orden=1`):
- `backend/app/repositories/publicacion_repo.py:196` (fetch_page), `:365` (detail bundle)
- `backend/app/routers/admin.py:121,190` (pendientes, cambiar_estado re-read)
- `backend/app/routers/publicaciones.py:222` (mias), `:379` (editar re-read), `:674` (similares)
- Frontend asume `fotos[0]` = portada en: `Card.jsx:22`, `Favoritos.jsx:173`, `Comparar.jsx:136-137`, `MisPublicaciones.jsx:327`, `GaleriaFotos.jsx:46`.
**Fix:** `order_by(ImagenPublicacion.orden.asc())` en los 7 eager-loads (o `orderby` en la relationship). Además `PATCH /upload/orden` y `DELETE /upload/{id}` no tienen rama mock (503 sin PG): añadir fallback mock o documentar que el gestor multimedia exige PG. Y `mock_to_out` devuelve `imagenes: []` siempre: en mock, simular ids/orden desde el índice de la URL.
**Tests:** reordenar vía API → `GET detalle` trae `imagenes[0].id == portada_id`; card usa portada tras refetch.

## DETALLES PEQUEÑOS VERIFICADOS (implementar todos)
1. **Bulk sin democión:** `admin.py::_bulk_cambiar_estado` no llama `evaluar_democion` (sí lo hacen `cambiar_estado` y `eliminar`). Un bulk-reject total deja ARRENDADOR con 0 vigentes. Añadir chequeo por dueño afectado en la misma transacción + test.
2. **Doble fuente de verdad en Publicar:** `validate()` (`Publicar.jsx:84-98`) hardcodea 10/150/20/2000/10M mientras el JSX usa `LIMITES` de `constants.js`. Unificar `validate()` a `LIMITES` (+ test con límite alterado vía mock si aplica).
3. **`dias_desactualizada` hardcodeada:** `constants.js: desactualizadaDias: 30` ignora el setting backend (misma clave existe en admin). Leerlo una vez (endpoint settings es solo-admin: exponer `GET /api/publicaciones/config-publica` con `{dias_desactualizada, titulo_min/max, ...}` o excluirlo y documentar la divergencia aceptada).
4. **`vistas` en mock:** `mock_to_out(..., mostrar_vistas)` en lista/similares mock pasa `False` fijo: en dev sin PG el dueño nunca ve su contador. Aceptable si se documenta; si no, pasar `True` en `mias` mock (ya es `True`) y documentar el resto.
5. **Revisar `require_arrendador` DB-fallback:** resuelve staleness post-promoción (ver commit), pero hace 1 query extra por request a `/upload*`. Si el tráfico sube, cachear rol 60s o emitir token fresco tras publicar (endpoint `POST /auth/refresh` futuro).
6. **`dev_token` de recovery:** solo se expone si `ENV!=prod` (verificado en `render.yaml`), pero añadir test que falle si `ENV=prod` + `_mock_enabled` coexisten.
7. **OTP invisible en logs locales:** `logger.info` con el código no sale por uvicorn (root en WARNING). Para DX local: `logging.basicConfig(level=logging.INFO)` en `main.py` solo si `ENV!=prod`.
8. **Onboarding Google sin teléfono:** el gate 400 al publicar está bien, pero el mensaje no dice DÓNDE vincularlo en 1 clic. Añadir CTA profunda al tab de teléfono en el error de Publicar (ya existe link a /perfil; verificar que abre el tab `datos`).
9. **`similares` incluye avisos del propio dueño:** decidir si excluir `usuario_id == base` (hoy se incluyen; para "descubrir" está bien, para "alternativas" no).
10. **Limpieza pendiente (bajo riesgo):** `get_auth_service`/`decode_token_provider_agnostic` sin cablear (decidir: cablear o purgar), `PUT` en CORS sin endpoints, `passlib` abandonado (migrar a `pwdlib`/bcrypt directo).

## ENTREGABLES DEL PRÓXIMO CHAT
1. Fixes 1-10 con tests (pytest + vitest 100%).
2. Actualizar `docs/HISTORICO_Y_CONTEXTO.md` bitácora (fila con fecha + validación) y este archivo (tachar lo hecho).
3. Reporte conciso. Sin push.
