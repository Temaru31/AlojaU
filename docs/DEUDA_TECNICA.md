# Deuda técnica registrada (auditoría de calidad, no bloqueante para main)

> Todo lo P0 está corregido. Esto es trabajo futuro ordenado por valor.
> Regla: cada ítem se ataca con su test antes del refactor.

## Frontend

1. **Partir monolitos** (sin cambiar UX): `Publicar.jsx` → `usePublicarForm()` +
   `PasoInfo/PasoUbi/PasoFotos/Preview`; `Buscar.jsx` → `useSnapshotBuscar()` +
   `useBuscarResultados()`; `App.jsx` → `components/Navbar.jsx`.
2. **Unificar selectores**: `SelectorTipo<select>` vs `SelectorTipoChips` vs
   `SelectorTipoPublicar` → uno con `variante='chips|select'`. Igual
   `CamposPrecio` (3 copias) y grids de servicios.
3. **`Filtros` default/`PanelCampos`/`soloPanel`**: verificar con `grep` si
   quedó muerto tras M4; si es así, eliminar.
4. **`utils/storage.js`**: `getJSON/setJSON` con prefijo `alojau:`, TTL y
   try/catch; migrar `alojau_*` sueltas (draft, campus, filtros, comparar).
5. **`utils/eventos.js` único**: `EVENTO_INFO` (Historial) + `ESTADO_LABEL`
   (MisPubs) + `MENSAJE_ESTADO_DUENO` (backend) divergen; una alerta nueva
   hoy toca 3 sitios (+ test contrato FE/BE).
6. **`useHistorial()` + `usePreferenciasNotifs()`**: extraer fetch de
   `HistorialAvisos` y `telegram_vinculado` repetido (base de la futura
   campanita y preferencias email).
7. **`CriterioAlerta` serializable** desde filtros Buscar (base de "guardar
   alerta" sin reescribir matching).

## Backend

1. **Decorador `@with_mock_fallback`**: ~40% de routers duplica rama PG/mock.
   Un decorador/repo común evitaría editar 2 ramas por cambio.
2. **Mover helpers a `services/`**: `auth.py` (teléfono, perfil, HMAC,
   start-payload), `publicaciones.py` (idempotencia, gate, fotos),
   inversión `notifications -> routers.auth` ya resuelta vía
   `services/telegram.py`.
3. **Bulk sin N+1**: `admin bulk` hace `db.get` por id; pasar a `WHERE id IN`
   + `UPDATE` batch.
4. **Complejidad**: activar `ruff C901` + `max-line-length` en CI y partir
   `crear_publicacion`, `_avatar_guardar`, `oauth_google_callback`.
5. **Outbox para notificaciones masivas**: hoy envío síncrono en request;
   con alertas de arriendo se necesita cola + digest diario.
6. **Observabilidad**: contador `notificaciones_enviadas{canal,estado}`.

## CI (parcialmente cubierto)

- ✅ Migraciones `db/migrations/*.sql` aplicadas en CI (falso negativo 017).
- Pendiente: `ruff --select E9,F` backend, `alembic check`, coverage por
  módulo, `scripts/verificar_telegram_e2e.py` contra staging.
