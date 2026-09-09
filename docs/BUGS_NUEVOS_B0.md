# BUGS NUEVOS hallados durante B0-base-solida (2026-09-09)

Convención: ARREGLADO = fix aplicado en esta rama; DOCUMENTADO = >3 líneas o fuera de alcance B0, para siguiente agente.

## ARREGLADOS (con fix en esta rama)

### B0-FIX-1 (alta): `except -> mock 200/201` enmascaraba caídas de DB también en prod
- Repro: con `ENV=prod` + DB caída, `GET /api/publicaciones` y `POST` devolvían 200/201 mock en vez de error.
- Archivos: `backend/app/routers/publicaciones.py:294,381,386,496`, `backend/app/routers/auth.py:77,100,116`
- Fix: helper `_mock_enabled()` (`core/config.py:53` + `settings.mock_enabled`) y `503 Base de datos no disponible` cuando mock deshabilitado. Rollback antes de 503/fallback.

### B0-FIX-2 (alta): detalle PENDIENTE público sin auth
- Repro: `GET /api/publicaciones/{id}` de una PENDIENTE devolvía 200 anónimo.
- Archivos: `backend/app/routers/publicaciones.py:331,338,391`
- Fix: auth opcional (`get_optional_user`, `core/security.py:40`) + 404 salvo owner/admin (`_is_owner_or_admin`, `publicaciones.py:34`). Test que codificaba el hueco actualizado: `backend/tests/test_hu_sprint1.py:150-164` (anónimo 404, owner/admin 200 + por qué).

### B0-FIX-3 (media): `telefono_verificado` defaulteaba `True`
- Repro: `user.get("telefono_verificado", True)` en crear regalaba +20 trust y wa.me a usuarios sin verificar.
- Archivos: `backend/app/routers/publicaciones.py:419,502` (antes `...:375,442`)
- Fix: default `False`.

### B0-FIX-4 (media): `distancia_geodesica_m = 0` cuando no había coords
- Repro: crear sin lat/lng guardaba `0` (implica "a 0m del campus").
- Archivos: `backend/app/routers/publicaciones.py:470`, `backend/app/models/__init__.py:166`, `backend/db/schema.sql:92`
- Fix: `dist = None` + columna nullable en modelo y schema. Migración local aplicada (ver B0-NEXT-1 para prod).

### B0-FIX-5 (media): sin validación FK (zona/campus/servicio fantasma → 500/integridad)
- Repro: `POST /api/publicaciones` con `zona_barrio_id: 999999` intentaba insertar y caía a mock 201.
- Archivos: `backend/app/routers/publicaciones.py:430-437`
- Fix: chequeo explícito `db.get` → 404 + rollback antes del flush.

### B0-FIX-6 (baja, 3 líneas): import shadowing `AsyncSession`
- Repro: `routers/publicaciones.py:18` hacía `from app.db.session import get_session, AsyncSession`, tapando el `AsyncSession` de sqlalchemy usado como anotación.
- Fix: importar solo `get_session` de sesión; `AsyncSession` queda el de sqlalchemy.

### B0-FIX-7 (media, infra tests): TestClient + QueuePool `attached to a different loop`
- Repro: requests secuenciales con TestClient alternaban DB-OK / mock-fallback (`RuntimeError ... different loop`, `Event loop is closed` al cerrar conexión).
- Archivo: `backend/app/db/session.py` (kwargs `_engine_kwargs`, NullPool bajo pytest).
- Fix: `poolclass=NullPool` solo cuando `"pytest" in sys.modules`. Prod/dev intactos (QueuePool 5-20). Verificado: 54/54 estables x3 runs.

## DOCUMENTADOS (para siguiente agente)

### B0-NEXT-1 (alta): aplicar migración distancia NULL en PROD (Supabase)
- Local ya migrado: `ALTER TABLE publicacion_campus ALTER COLUMN distancia_geodesica_m DROP NOT NULL` (verificado `YES`).
- Pendiente correr lo mismo en Supabase SQL Editor + alinear `schema.sql:92` (ya cambiado a `INTEGER NULL` en esta rama).
- Severidad alta: sin esto, crear sin coords en prod da 503 (columna NOT NULL rechaza None).

### B0-NEXT-2 (media): `routers/campus.py:13-24` aún con fallback mock sin fail-closed
- Repro: `GET /api/campus` con DB caída devuelve `MOCK_CAMPUS` incluso en prod (sin chequeo `_mock_enabled`, sin 503).
- Alcance B0 cubría `publicaciones.py:268-293,341-349,381-444,295-349`; campus quedó fuera a propósito (mínimo). Siguiente agente: replicar patrón `_mock_enabled()` + 503.

### B0-NEXT-3 (media): rate-limit en memoria (por proceso, se pierde al reiniciar)
- Archivo: `backend/app/routers/auth.py:34-46` (`_LOGIN_ATTEMPTS`, 5/min/IP → 429).
- Limitación: con 2+ réplicas en Render cada una cuenta aparte; reinicio limpia. Siguiente agente (escala): migrar a slowapi+Redis si hay múltiples workers.

### B0-NEXT-4 (baja): paginación en memoria en `_query_db_lista`
- Archivo: `backend/app/routers/publicaciones.py:219-224` (trae todo y corta en Python; OK para MVP, mal para >1000 filas).
- Siguiente agente: LIMIT/OFFSET en SQL cuando el dataset crezca.

### B0-NEXT-5 (baja): `MOCK_PUBS` global mutable contamina tests
- Archivo: `backend/app/routers/publicaciones.py:36-73` (+ appends en crear mock).
- Efecto: ids `10000+` crecen entre tests; el test hu003 usa búsqueda por título para evitar colisión. Siguiente agente: fixture que resetea `MOCK_PUBS` o factoría.

### B0-NEXT-6 (info): auth sin verificación de email ni password fuerte
- Archivo: `backend/app/routers/auth.py:25-32` (password 6-72, sin mayúscula/número obligatorio; `telefono_verificado=False` por defecto, sin flujo de verificación aún).
- Siguiente agente (login nuevo): definir flujo verificación WhatsApp + política password.
