"""
routers/publicaciones.py - HU-001,002,003,005,007 (Sprint1) + Mis publicaciones (UX) + PA-01 Renovación
Endpoints:
  GET   /api/publicaciones?campus_id=&precio_min=&precio_max=&tipo=&servicios=  (HU-001+002)
  GET   /api/publicaciones/mias                                                 (UX: dueño, todos los estados)
  GET   /api/publicaciones/{id}                                                 (HU-003+007)
  POST  /api/publicaciones                                                      (HU-005 -> PENDIENTE, solo ARRENDADOR)
  PATCH /api/publicaciones/{id}                                                 (UX editar aviso del dueño)
  PATCH /api/publicaciones/{id}/renovar                                         (PA-01 renovación 30 días)

Consulta real con Haversine + TrustScoreEngine; sin BD responde 503.
NFR P95<500ms: query indexada (estado, zona, canon), sin N+1, Haversine en memoria/Python.
"""
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query, Path, HTTPException, status, Header, Request
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.core.config import settings
from app.core.security import get_current_user, get_optional_user
from app.core.logseguro import exc_resumen
from app.repositories import publicacion_repo as repo
from app.services import publicacion_view as view
from app.schemas.publicacion import (
    PublicacionCreate,
    PublicacionCreatedOut,
    PublicacionCardOut,
    PublicacionDetailOut,
    PublicacionUpdate,
    PaginatedPublicaciones,
    RenovacionOut,
)
from app.core.pagination import paginate_params, build_paginated
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
import logging
import re
from app.core.db_utils import rollback_seguro
from app.core.net import client_ip
from app.core.rate_limit import (
    registrar_intento, registrar_intento_persistente, verificar_intentos_fallidos,
)
from app.core.dominio import EstadoPublicacion, Rol
from app.core.permissions import has_scope
from app.core.security import es_dueno_o_admin
from app.services.config_sistema import DEFAULTS
logger = logging.getLogger("alojau.publicaciones")

# Anti-flood de creación: 10 publicaciones/hora por usuario (memoria por
# worker). Un aviso legítimo tarda minutos en redactarse; sin esto, una
# cuenta verifica email+teléfono una vez e inunda la cola de moderación y
# la tabla con INSERTs + FK checks. Memoria (no PG): la tabla
# rate_limit_attempts solo cuenta fallidos; aquí se limitan intentos.
_PUB_ATTEMPTS: dict[str, list[float]] = {}
PUB_LIMIT = 10
PUB_WINDOW_S = 3600.0


def clear_pub_rate_limit_for_tests() -> None:
    _PUB_ATTEMPTS.clear()


def _check_pub_rate_limit(uid: int) -> None:
    registrar_intento(_PUB_ATTEMPTS, f"pub:{uid}", PUB_LIMIT, PUB_WINDOW_S,
                      "Demasiadas publicaciones, espera 1 hora")


# Idempotencia de POST /api/publicaciones (solo este endpoint;
# el resto de escrituras sigue sin reintento por defecto en el cliente).
IDEM_RUTA_CREAR = "POST /api/publicaciones"
IDEM_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
IDEM_TTL_HORAS = 24


def _idem_validar(clave: str | None) -> str | None:
    """Normaliza el header o None si ausente. 422 si malformada.

    En invocación directa (tests/CI) el default de FastAPI llega como
    objeto `Header`, no como None: todo lo no-str se trata como ausente.
    """
    if clave is None or not isinstance(clave, str):
        return None
    clave = clave.strip()
    if not clave:
        return None
    if not IDEM_RE.match(clave):
        raise HTTPException(status_code=422, detail="Idempotency-Key inválida (8-64 [A-Za-z0-9_-])")
    return clave


async def _idem_replay(db: AsyncSession, clave: str, uid: int) -> dict | None:
    """Respuesta guardada vigente o None."""
    try:
        from app.models import IdempotencyKey
        row = await db.get(IdempotencyKey, (clave, uid, IDEM_RUTA_CREAR))
        if row is None:
            return None
        exp = row.expira_en
        if getattr(exp, "tzinfo", None) is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp <= datetime.now(timezone.utc):
            return None
        return {"codigo": int(row.codigo), "cuerpo": dict(row.cuerpo)}
    except HTTPException:
        raise
    except Exception:
        await rollback_seguro(db, "_idem_replay")
        return None


async def _idem_guardar(db: AsyncSession, clave: str, uid: int, cuerpo: dict) -> dict | None:
    """Guarda la respuesta; ante carrera (UNIQUE) devuelve el replay ganador.

    `cuerpo` se sanea a JSON puro (default=str) para no romper el JSONB.
    Retorna el replay en caso de colisión o None si guardó limpio.
    """
    import json as _json
    limpio = _json.loads(_json.dumps(cuerpo, default=str))
    expira = datetime.now(timezone.utc) + timedelta(hours=IDEM_TTL_HORAS)
    try:
        from app.models import IdempotencyKey
        # Limpieza best-effort de vencidas (tabla acotada).
        try:
            await db.execute(
                IdempotencyKey.__table__.delete().where(
                    IdempotencyKey.expira_en < datetime.now(timezone.utc))
            )
        except Exception as e:
            logger.warning("[idempotencia] limpieza de claves vencidas falló: %s", exc_resumen(e))
        db.add(IdempotencyKey(
            clave=clave, usuario_id=uid, ruta=IDEM_RUTA_CREAR,
            codigo=201, cuerpo=limpio, expira_en=expira,
        ))
        await db.commit()
        return None
    except IntegrityError:
        # Carrera perdida: otro worker guardó primero -> replay ganador.
        await rollback_seguro(db, "_idem_guardar")
        return await _idem_replay(db, clave, uid)
    except Exception as e:
        await rollback_seguro(db, "_idem_guardar")
        logger.warning(f"[idempotencia] no se pudo guardar (se responde igual): {exc_resumen(e)}")
        return None

router = APIRouter(prefix="/api/publicaciones", tags=["publicaciones"])


_VISTAS_MEM_LIMIT = 120
_VISTAS_MEM_WINDOW_S = 60.0


async def _db_rate_check_vista(db: AsyncSession, ip: str) -> None:
    """Throttle anti-inflado de vistas (conteo persistente en PG)."""
    try:
        await verificar_intentos_fallidos(db, f"vista:{ip}", limite=_VISTAS_MEM_LIMIT,
                                          ventana_s=int(_VISTAS_MEM_WINDOW_S))
        await registrar_intento_persistente(db, f"vista:{ip}", False)
    except HTTPException:
        raise
    except Exception:
        await rollback_seguro(db, "_db_rate_check_vista")


# --- Endpoints Sprint1 ---
@router.get("", response_model=PaginatedPublicaciones, summary="HU-001 Buscar por sede + HU-002 Filtros + búsqueda tokenizada + multiciudad")
async def list_publicaciones(
    campus_id: Optional[int] = Query(None, ge=1, le=1000, description="FK campus_universitarios.id - filtra por lugar cercano (POIs por categoría)"),
    precio_min: Optional[int] = Query(None, ge=0, le=10_000_000, description="COP mínimo"),
    precio_max: Optional[int] = Query(None, ge=0, le=10_000_000, description="COP máximo"),
    # Sin pattern estático (el catálogo vive en housing_types). Se valida
    # contra la tabla (esta_activo=true) con caché 5min; 422 si no existe.
    tipo: Optional[str] = Query(None, min_length=3, max_length=40, description="Slug de housing_types (ej. APARTAESTUDIO)"),
    servicios: Optional[str] = Query(None, max_length=50, description="IDs coma separados, ej: 1,3"),
    q: Optional[str] = Query(None, min_length=2, max_length=100, description="Texto libre tokenizado: stop-words ES fuera, OR parcial + relevancia (Fase 2)"),
    ciudad_id: Optional[int] = Query(None, ge=1, le=1000000, description="Fase 4 multiciudad: filtra por Ciudad.id vía zona"),
    ciudad_slug: Optional[str] = Query(None, min_length=2, max_length=100, pattern="^[a-z0-9-]+$", description="Fase 4 multiciudad: slug de ciudad, ej: popayan"),
    page: int = Query(1, ge=1, le=1000, description="Página 1-indexed"),
    size: int = Query(9, ge=1, le=50, description="Tamaño página"),
    db: AsyncSession = Depends(get_session),
):
    """
    HU-001 Criterios:
      1. Al seleccionar sede se muestran publicaciones asociadas (publicacion_campus)
      2. Solo ACTIVAS
      3. Si no hay resultados -> [] + frontend muestra 'Sin resultados' (HU-001 C3)

    HU-002: precio_min <= precio_max, filtros combinables (AND).

    """
    # Validación combinada HU-002 C1
    if precio_min is not None and precio_max is not None and precio_min > precio_max:
        raise HTTPException(status_code=400, detail="precio_min no puede superar precio_max")

    # Validación dinámica contra housing_types (sin pattern estático).
    if tipo is not None:
        await _exigir_tipo_activo(db, tipo, "tipo")

    servicios_ids = view.parse_servicios_param(servicios)

    try:
        try:
            ciudad_id_res = await repo.resolver_ciudad_id(db, ciudad_id, ciudad_slug)
        except ValueError as ve:
            raise HTTPException(status_code=404, detail=str(ve))
        total, pubs, rep_map, user_map, dist_map, size_norm = await repo.query_lista(
            db, campus_id, precio_min, precio_max, tipo, servicios_ids, page, size, q,
            ciudad_id_res, None,
        )
        mostrar = await repo.vistas_publicas(db)
        dest_map = await repo.fetch_destacados_map(db, [p.id for p in pubs])
        items = view.cards_for_page(pubs, rep_map, user_map, dist_map, campus_id, mostrar, dest_map)
        return build_paginated(items, total, page, size_norm)
    except HTTPException:
        raise
    except Exception as e:
        # Log real para diagnóstico en Render (no ocultar excepción)
        logger.error(f"[DB fallback] query_lista falló: {exc_resumen(e)}", exc_info=True)
        await rollback_seguro(db, "list_publicaciones")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")

@router.get("/mias", response_model=PaginatedPublicaciones, summary="UX Mis publicaciones del dueño (todos los estados, paginado)")
async def mis_publicaciones(
    estado: Optional[str] = Query(None, pattern="^(ACTIVO|PENDIENTE|PAUSADO|PAUSADO_POR_REPORTE|REVISION_REQUERIDA|RECHAZADO|ARRENDADO|EXPIRADO|DESACTIVADO)$", description="Filtra por estado (default todos)"),
    page: int = Query(1, ge=1, le=1000, description="Página 1-indexed"),
    size: int = Query(12, ge=1, le=50, description="Tamaño página"),
    orden: str = Query("recientes", pattern="^(recientes|vistas|estado)$",
                       description="Orden del panel: recientes (default), vistas desc o estado"),
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """Lista las publicaciones del usuario autenticado en TODOS los estados
    (ACTIVO + PENDIENTE en moderación + otros), paginado, con orden server-side
    (M6: el orden en cliente mentiría con paginación multipágina).
    Sin token -> 401. Cada dueño solo ve las suyas (filtro usuario_id).
    NOTA: declarada ANTES de /{pub_id} para que "mias" no caiga en el path param."""
    uid = user.get("id")
    # Token sin id entero válido -> 401 (nunca filtrar por dueño ajeno).
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    try:
        from app.models import Publicacion
        from sqlalchemy import case as _case

        conds = [Publicacion.usuario_id == uid]
        if estado:
            conds.append(Publicacion.estado == estado)
        total_stmt = select(func.count()).select_from(Publicacion).where(*conds)
        total = (await db.execute(total_stmt)).scalar() or 0
        offset, size_norm = paginate_params(page, size)
        if orden == "vistas":
            order_cols = [Publicacion.vistas.desc(), Publicacion.id.desc()]
        elif orden == "estado":
            # Mismo orden lógico que el panel (ACTIVO primero, terminales al final).
            order_cols = [_case(
                {e: i for i, e in enumerate([
                    EstadoPublicacion.ACTIVO, EstadoPublicacion.PENDIENTE, EstadoPublicacion.PAUSADO, EstadoPublicacion.PAUSADO_POR_REPORTE,
                    EstadoPublicacion.REVISION_REQUERIDA, EstadoPublicacion.RECHAZADO, EstadoPublicacion.ARRENDADO,
                    EstadoPublicacion.EXPIRADO, EstadoPublicacion.DESACTIVADO])},
                value=Publicacion.estado, else_=99,
            ).asc(), Publicacion.id.desc()]
        else:
            order_cols = [Publicacion.id.desc()]
        stmt = (
            select(Publicacion)
            .options(
                selectinload(Publicacion.imagenes),
                selectinload(Publicacion.servicios),
                selectinload(Publicacion.zona),
            )
            .where(*conds)
            .order_by(*order_cols)
            .limit(size_norm)
            .offset(offset)
        )
        pubs = (await db.execute(stmt)).scalars().unique().all()
        if not pubs:
            return build_paginated([], total, page, size_norm)
        rep_map, users_map, _ = await repo.fetch_page_aggregates(db, pubs, None)
        return build_paginated(view.cards_for_page(pubs, rep_map, users_map, {}, None, True), total, page, size_norm)
    except HTTPException:
        raise
    except Exception as e:
        _uid_seguro = str(uid).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB fallback] mis_publicaciones {_uid_seguro} falló: {_err_seguro}", exc_info=True)
        await rollback_seguro(db, "mis_publicaciones")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.get("/mias/historial", summary="Dueño: actividad reciente de mis avisos")
async def mi_historial(
    page: int = Query(1, ge=1, le=1000),
    size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """Trazabilidad agregada: últimos eventos (creada, aprobada, pausada,
    renovada...) de TODOS los avisos del dueño, con título del aviso.
    Solo dueño (401/403 por contrato). Base del centro de notificaciones
    dentro de la app (ver docs/NOTIFICACIONES.md).
    """
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    try:
        from app.models import Publicacion, PublicacionesAudit

        base = (
            select(PublicacionesAudit, Publicacion.titulo)
            .join(Publicacion, PublicacionesAudit.publicacion_id == Publicacion.id)
            .where(Publicacion.usuario_id == uid)
        )
        total = (await db.execute(
            select(func.count()).select_from(PublicacionesAudit)
            .join(Publicacion, PublicacionesAudit.publicacion_id == Publicacion.id)
            .where(Publicacion.usuario_id == uid)
        )).scalar() or 0
        offset, size_norm = paginate_params(page, size)
        rows = (await db.execute(
            base.order_by(PublicacionesAudit.id.desc()).limit(size_norm).offset(offset)
        )).all()
        return {"items": [
            {"id": a.id, "publicacion_id": a.publicacion_id, "titulo": titulo,
             "evento": a.evento, "detalle": a.detalle,
             "creado_en": a.creado_en.isoformat() if a.creado_en else None}
            for a, titulo in rows],
            "total": total, "page": page, "size": size_norm}
    except HTTPException:
        raise
    except Exception as e:
        _uid_seguro = str(uid).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB fallback] mias/historial {_uid_seguro} falló: {_err_seguro}", exc_info=True)
        await rollback_seguro(db, "mi_historial")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")

@router.get("/config-publica", summary="Config pública de validación y frescura (sin auth)")
async def config_publica(db: AsyncSession = Depends(get_session)):
    """Detalle #3: expone los settings que el frontend hardcodeaba.

    GET /api/publicaciones/config-publica -> {dias_desactualizada,
    titulo_min/max, descripcion_min/max, direccion_min/max, reglas_min/max,
    fotos_min/max, canon_max, vistas_visibles_publico}. Públicos (sin auth),
    1 query a system_settings con fallback a DEFAULTS si no hay PG. El
    frontend lo lee una vez y cachea (ver constants.js fetchConfigPublica);
    si falla, usa LIMITES locales (divergencia aceptada y documentada).
    NOTA: declarada ANTES de /{pub_id} para no caer en el path param.
    """
    _KEYS = ["dias_desactualizada", "titulo_min", "titulo_max",
             "descripcion_min", "descripcion_max", "fotos_min_publicar",
             "vistas_visibles_publico"]
    vals = {k: DEFAULTS[k][0] for k in _KEYS if k in DEFAULTS}
    try:
        from app.models import SystemSetting
        rows = (await db.execute(select(SystemSetting).where(
            SystemSetting.clave.in_(_KEYS)))).scalars().all()
        for r in rows:
            vals[r.clave] = r.valor
    except Exception as e:
        await rollback_seguro(db, "config_publica")
        # Lectura pública: nunca 503, se sirven los DEFAULTS.
        logger.warning("[config pública] ajustes desde BD fallaron: %s", exc_resumen(e))
    def _iv(k, d):
        try:
            return int(vals.get(k, d))
        except Exception:
            return d
    # Aditivo: catálogo de tipos dinámicos (caché 5min, fallback local).
    from app.services import housing_types as _ht
    tipos = await _ht.get_activos(db)  # nunca lanza: cae al catálogo estático
    return {
        "dias_desactualizada": _iv("dias_desactualizada", 30),
        "titulo_min": _iv("titulo_min", 10),
        "titulo_max": _iv("titulo_max", 150),
        "descripcion_min": _iv("descripcion_min", 20),
        "descripcion_max": _iv("descripcion_max", 2000),
        "direccion_min": 10, "direccion_max": 200,
        "reglas_min": 10, "reglas_max": 2000,
        "fotos_min": _iv("fotos_min_publicar", 3), "fotos_max": 10,
        "canon_max": 10_000_000,
        "vistas_visibles_publico": str(vals.get("vistas_visibles_publico", "false")).lower() == "true",
        "tipos_vivienda": tipos,
        # Chatbot MVP: el front oculta el widget si viene false (Fase 3).
        "chat_enabled": bool(settings.CHAT_ENABLED),
    }

@router.get("/{pub_id}", response_model=PublicacionDetailOut, summary="HU-003 Detalle + HU-007 Índice + HU-008 WhatsApp")
async def get_publicacion(
    pub_id: int = Path(..., ge=1, le=1000000),
    campus_id: Optional[int] = Query(None, ge=1, le=1000000, description="004 POIs: resuelve campus_ref (distancia a ESTE lugar) para sincronizar el mapa del Detalle"),
    db: AsyncSession = Depends(get_session),
    authorization: Optional[str] = Header(None),
):
    """
    HU-003: muestra canon, servicios, fotos, zona, condiciones, vigencia
            No expone datos que no deban ser públicos (email propietario, etc)
    HU-007: incluye indice_confianza 0-100 + desglose 40+20+15+15+10 + disclaimer
    HU-008: telefono_whatsapp solo si verificado + whatsapp_url wa.me
    PENDIENTE (y no-ACTIVO) es privado -> 404 salvo owner/admin.
    """
    current_user = await get_optional_user(authorization)
    try:
        p, reportes_activos, u, dist_detalle = await repo.fetch_detail_bundle(db, pub_id)
        if p:
            # Ley 1581: dueño eliminado -> invisible salvo ADMIN
            # (la búsqueda ya los excluye; esto cubre acceso directo por URL).
            if (u is not None and getattr(u, "eliminado_en", None) is not None
                    and not (current_user and current_user.get("rol") == Rol.ADMIN)):
                raise HTTPException(status_code=404, detail="Publicación no encontrada")
            # Detalle no-ACTIVO privado (404 para no filtrar existencia).
            if p.estado != EstadoPublicacion.ACTIVO and not await es_dueno_o_admin(current_user, p.usuario_id):
                raise HTTPException(status_code=404, detail="Publicación no encontrada")
            # 004 POIs: referencia al lugar buscado (el mapa del Detalle se
            # sincroniza a ESTE punto; sin campus_id se usa la distancia mínima).
            campus_ref = None
            dist = dist_detalle
            if campus_id is not None:
                from app.services.haversine import tiempo_pie_min
                dist_ref, lugar = await repo.fetch_detail_campus_ref(db, pub_id, campus_id)
                dist = dist_ref
                campus_ref = {
                    "campus_id": lugar.id,
                    "institucion": lugar.institucion,
                    "nombre_sede": lugar.nombre_sede,
                    "latitud": float(lugar.latitud),
                    "longitud": float(lugar.longitud),
                    "dist_m": dist_ref,
                    "tiempo_pie_min": tiempo_pie_min(dist_ref),
                }
            _dest_map = await repo.fetch_destacados_map(db, [p.id])
            _info = _dest_map.get(p.id)
            return view.build_detail(
                p, reportes_activos, u, dist, campus_ref,
                await repo.vistas_publicas(db) or await es_dueno_o_admin(current_user, p.usuario_id),
                _info is not None,
                _info["vence"] if _info else None,
            )
    except HTTPException:
        raise
    except Exception as e:
        # CWE-117: pub_id viene del path; sanear CR/LF antes de loguear.
        safe_pub_id = str(pub_id).replace("\r", "").replace("\n", "")
        logger.error(f"[DB fallback] get_publicacion {safe_pub_id} falló: {exc_resumen(e)}", exc_info=True)
        await rollback_seguro(db, "get_publicacion")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    raise HTTPException(status_code=404, detail="Publicación no encontrada")

@router.patch("/{pub_id}", response_model=PublicacionCardOut, summary="UX Editar aviso del dueño (solo owner/ADMIN)")
async def editar_publicacion(
    pub_id: int = Path(..., ge=1, le=1000000),
    payload: PublicacionUpdate = ...,
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """Edición parcial del dueño: escalares + `servicios_ids` opcional
    (reemplazo total de etiquetas, con FK validadas). Las fotos van por
    PATCH /{id}/fotos (reconciliación atómica, M4).
    401 sin token o sin id válido, 403 si no es dueño ni ADMIN, 404 si no existe,
    422 si algún campo viola cotas (iguales a Create) o el body viene vacío.
    El estado NO cambia con la edición. Sin fila de audit: el CHECK de
    publicaciones_audit no tiene evento EDITED (migración pendiente)."""
    cambios = {k: v for k, v in payload.model_dump().items() if v is not None}
    servicios_nuevos = cambios.pop("servicios_ids", None)
    if servicios_nuevos is not None:
        servicios_nuevos = list(dict.fromkeys(servicios_nuevos))
    # Commit único: el set de fotos viaja en el mismo PATCH (ya validado
    # por el schema). Un solo commit para escalares + etiquetas + fotos.
    fotos_nuevas = cambios.pop("fotos", None)
    # Si cambia el tipo, validar contra housing_types (esta_activo=true).
    if "tipo_inmueble" in cambios:
        await _exigir_tipo_activo(db, cambios["tipo_inmueble"], "tipo_inmueble")
    try:
        from app.models import Publicacion, PublicacionServicio, ServicioCatalogo

        p = await db.get(Publicacion, pub_id)
        if not p:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        if not await es_dueno_o_admin(user, p.usuario_id):
            raise HTTPException(status_code=403, detail="Solo el dueño puede editar")
        if servicios_nuevos is not None:
            for sid in servicios_nuevos:
                if not await db.get(ServicioCatalogo, sid):
                    raise HTTPException(status_code=404, detail=f"servicio_id {sid} no existe")
        for k, v in cambios.items():
            setattr(p, k, v)
        if servicios_nuevos is not None:
            await db.execute(
                PublicacionServicio.__table__.delete().where(
                    PublicacionServicio.publicacion_id == pub_id)
            )
            for sid in servicios_nuevos:
                db.add(PublicacionServicio(publicacion_id=pub_id, servicio_id=sid))
        if fotos_nuevas is not None:
            await _reconciliar_fotos_urls(db, pub_id, list(fotos_nuevas))
        await db.commit()
        # La sesión usa expire_on_commit=False: el DELETE Core no invalida la
        # colección ORM en el identity map y el re-read la traería rancia.
        # Se expira explícitamente antes de releer con eager loading.
        # OJO: AsyncSession.expire es síncrono (no lleva await; await None
        # lanzaría TypeError y respondería 503 en vez de 422).
        db.expire(p, ["servicios"])
        # Re-lee con eager loading (refresh() no recarga relaciones en async).
        stmt = (
            select(Publicacion)
            .options(
                selectinload(Publicacion.imagenes),
                selectinload(Publicacion.servicios),
                selectinload(Publicacion.zona),
            )
            .where(Publicacion.id == pub_id)
        )
        p = (await db.execute(stmt)).scalars().unique().one()
        rep_map, users_map, _ = await repo.fetch_page_aggregates(db, [p], None)
        return view.cards_for_page([p], rep_map, users_map, {}, None, True)[0]
    except HTTPException:
        await rollback_seguro(db, "editar_publicacion")
        raise
    except Exception as e:
        _pub_id_seguro = str(pub_id).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB fallback] editar {_pub_id_seguro} falló: {_err_seguro}", exc_info=True)
        await rollback_seguro(db, "editar_publicacion")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


async def _reconciliar_fotos_urls(db: AsyncSession, pub_id: int, urls: list[str]) -> list:
    """Alta/baja/reorden de fotos en UNA pasada (sin commit).

    Fuente única para PATCH /{id} (campo `fotos`) y PATCH /{id}/fotos.
    Las URLs ya vienen normalizadas y validadas. Usa orden temporal 1000+i
    para no violar UNIQUE(publicacion_id, orden) a mitad de camino.
    Retorna las filas finales ordenadas por orden.
    """
    from app.models import ImagenPublicacion

    actuales = (await db.execute(
        select(ImagenPublicacion).where(
            ImagenPublicacion.publicacion_id == pub_id)
    )).scalars().all()
    por_url = {r.url: r for r in actuales}
    vistas = set(urls)
    for r in actuales:
        if r.url not in vistas:
            await db.delete(r)
    await db.flush()
    vivas = [por_url[u] for u in urls if u in por_url]
    for i, row in enumerate(vivas):
        row.orden = 1000 + i
    await db.flush()
    for i, url in enumerate(urls, start=1):
        row = por_url.get(url)
        if row is not None and url in vistas:
            row.orden = i
        else:
            db.add(ImagenPublicacion(publicacion_id=pub_id, url=url, orden=i))
    await db.flush()
    return (await db.execute(
        select(ImagenPublicacion).where(ImagenPublicacion.publicacion_id == pub_id)
        .order_by(ImagenPublicacion.orden.asc())
    )).scalars().all()


class FotosSetIn(BaseModel):
    """Set completo y ordenado de fotos (la posición 0 es la portada)."""
    fotos: list[str] = Field(min_length=1, max_length=10)


@router.patch("/{pub_id}/fotos", summary="Dueño: reemplazar set de fotos (atómico)")
async def reemplazar_fotos(
    pub_id: int = Path(..., ge=1, le=1000000),
    payload: FotosSetIn = ...,
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """M4 edición bufferizada: el frontend acumula altas/bajas/reorden en
    estado local y commitea UNA vez aquí (1 transacción: altas + bajas +
    reorden 1..N). Solo dueño o ADMIN. 401/403/404/422.

    Las URLs deben venir de `POST /upload/una` (storage) o externas http(s);
    duplicadas o no-http → 422. Sin fila de audit (sin evento FOTOS en el
    CHECK de auditoría).
    """
    urls = [str(u or "").strip()[:500] for u in (payload.fotos or []) if str(u or "").strip()]
    if not urls:
        raise HTTPException(status_code=422, detail="fotos vacío")
    if len(urls) > 10:
        raise HTTPException(status_code=422, detail="Máximo 10 fotos por aviso")
    if len(set(urls)) != len(urls):
        raise HTTPException(status_code=422, detail="fotos duplicadas")
    for u in urls:
        if not (u.startswith("https://") or u.startswith("http://")):
            raise HTTPException(status_code=422, detail="URLs deben ser http(s)")
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    try:
        from app.models import ImagenPublicacion, Publicacion

        pub = await db.get(Publicacion, pub_id)
        if not pub:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        if not await es_dueno_o_admin(user, pub.usuario_id):
            raise HTTPException(status_code=403, detail="Solo el dueño puede editar fotos")
        await _reconciliar_fotos_urls(db, pub_id, urls)
        await db.commit()
        filas = (await db.execute(
            select(ImagenPublicacion).where(ImagenPublicacion.publicacion_id == pub_id)
            .order_by(ImagenPublicacion.orden.asc())
        )).scalars().all()
        return {"id": pub_id,
                "fotos": [r.url for r in filas],
                "imagenes": [{"id": r.id, "url": r.url, "orden": r.orden} for r in filas],
                "total": len(filas)}
    except HTTPException:
        await rollback_seguro(db, "reemplazar_fotos")
        raise
    except Exception as e:
        _pub_id_seguro = str(pub_id).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB fallback] fotos {_pub_id_seguro} falló: {_err_seguro}", exc_info=True)
        await rollback_seguro(db, "reemplazar_fotos")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.patch("/{pub_id}/renovar", response_model=RenovacionOut, summary="PA-01 Renovar vigencia 30 días (solo propietario)")
async def renovar_publicacion(
    pub_id: int = Path(..., ge=1, le=1000000),
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """
    PA-01: Renueva la vigencia de una publicación por 30 días calendario exactos.

    Reglas:
    - 401 sin token válido.
    - 403 si el usuario autenticado no es el dueño de la publicación.
    - 404 si la publicación no existe.
    - Vigente:  nueva_expiracion = fecha_expiracion_actual + 30 días.
    - Vencida:  nueva_expiracion = ahora + 30 días.
    - EXPIRADO → pasa a ACTIVO. RECHAZADO/DESACTIVADO conservan su estado.
    - Genera fila en publicaciones_audit con evento='RENEWED'.
    """
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    try:
        datos = await repo.renovar_publicacion(db, pub_id, uid)
        return datos
    except HTTPException:
        await rollback_seguro(db, "renovar_publicacion")
        raise
    except Exception as e:
        _pub_id_seguro = str(pub_id).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB] renovar_publicacion {_pub_id_seguro} falló: {_err_seguro}", exc_info=True)
        await rollback_seguro(db, "renovar_publicacion")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.delete("/{pub_id}", status_code=status.HTTP_200_OK, summary="Dueño: eliminar aviso (democión N->0 si queda sin inventario)")
async def eliminar_publicacion(
    pub_id: int = Path(..., ge=1, le=1000000),
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """v13.2: el dueño (o ADMIN) elimina su aviso.

    Misma transacción: DELETE + conteo de vigentes + democión a ESTUDIANTE
    si el inventario llega a 0 (row-lock anti-carreras). Responde el rol
    para que el frontend refresque sin re-login.
    401 sin token/id, 403 si no es dueño ni ADMIN, 404 si no existe.
    """
    from app.services import role_lifecycle as _rl
    uid_token = user.get("id")
    if not isinstance(uid_token, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    try:
        from app.models import Publicacion

        p = await db.get(Publicacion, pub_id)
        if not p:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        if not await es_dueno_o_admin(user, p.usuario_id):
            raise HTTPException(status_code=403, detail="Solo el dueño puede eliminar")
        dueno_id = p.usuario_id
        await db.delete(p)
        await db.flush()
        rol_final, democionado = await _rl.evaluar_democion(db, dueno_id)
        await db.commit()
        return {"id": pub_id, "eliminada": True, "rol": rol_final,
                "rol_actualizado": democionado,
                "mensaje": "Publicación eliminada." + (
                    " Tu rol volvió a Usuario Base." if democionado else "")}
    except HTTPException:
        await rollback_seguro(db, "eliminar_publicacion")
        raise
    except Exception as e:
        _pub_id_seguro = str(pub_id).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB fallback] eliminar {_pub_id_seguro} falló: {_err_seguro}", exc_info=True)
        await rollback_seguro(db, "eliminar_publicacion")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.patch("/{pub_id}/estado", summary="Dueño: pausar/reanudar aviso (ACTIVO<->PAUSADO)")
async def cambiar_estado_dueno(
    pub_id: int = Path(..., ge=1, le=1000000),
    payload: dict = ...,
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """v15.2 switch del arrendador. Solo dueño (o ADMIN).

    Allowlist: ACTIVO <-> PAUSADO y solo desde esos mismos estados (nunca
    desde PENDIENTE/RECHAZADO: eso eludiría la moderación -> 409).
    Misma transacción: estado + audit (PAUSED/RESUMED) + chequeo democión.
    """
    from app.services import role_lifecycle as _rl

    nuevo = (payload or {}).get("estado") if isinstance(payload, dict) else None
    if nuevo not in (EstadoPublicacion.ACTIVO, EstadoPublicacion.PAUSADO):
        raise HTTPException(status_code=422, detail="estado debe ser ACTIVO o PAUSADO")
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    try:
        from app.models import Publicacion, PublicacionesAudit

        p = await db.get(Publicacion, pub_id)
        if not p:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        if not await es_dueno_o_admin(user, p.usuario_id):
            raise HTTPException(status_code=403, detail="Solo el dueño puede cambiar el estado")
        if p.estado not in (EstadoPublicacion.ACTIVO, EstadoPublicacion.PAUSADO):
            raise HTTPException(
                status_code=409,
                detail=f"No se puede cambiar estado desde {p.estado} (solo ACTIVO<->PAUSADO)",
            )
        if p.estado == nuevo:
            return {"id": p.id, "estado": p.estado, "rol": user.get("rol"),
                    "rol_actualizado": False, "mensaje": "Sin cambios."}
        p.estado = nuevo
        db.add(PublicacionesAudit(
            publicacion_id=pub_id,
            usuario_id=uid,
            evento="PAUSED" if nuevo == EstadoPublicacion.PAUSADO else "RESUMED",
            detalle=f"Cambio a {nuevo} por el dueño",
        ))
        await db.flush()
        rol_final, democionado = await _rl.evaluar_democion(db, p.usuario_id)
        await db.commit()
        return {"id": p.id, "estado": nuevo, "rol": rol_final,
                "rol_actualizado": democionado,
                "mensaje": f"Aviso {nuevo.lower()}."}
    except HTTPException:
        await rollback_seguro(db, "cambiar_estado_dueno")
        raise
    except Exception as e:
        _pub_id_seguro = str(pub_id).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB fallback] estado {_pub_id_seguro} falló: {_err_seguro}", exc_info=True)
        await rollback_seguro(db, "cambiar_estado_dueno")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.get("/{pub_id}/historial", summary="Dueño: historial del aviso")
async def historial_aviso(
    pub_id: int = Path(..., ge=1, le=1000000),
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """M4 historial del inmueble: eventos del aviso (creada, pausada,
    aprobada...) en orden cronológico. Solo dueño o ADMIN (401/403/404).
    """
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    try:
        from app.models import Publicacion, PublicacionesAudit

        pub = await db.get(Publicacion, pub_id)
        if not pub:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        if not await es_dueno_o_admin(user, pub.usuario_id):
            raise HTTPException(status_code=403, detail="Solo el dueño puede ver el historial")
        rows = (await db.execute(
            select(PublicacionesAudit).where(PublicacionesAudit.publicacion_id == pub_id)
            .order_by(PublicacionesAudit.id.asc()).limit(50)
        )).scalars().all()
        return {"id": pub_id, "items": [
            {"id": r.id, "evento": r.evento, "detalle": r.detalle,
             "creado_en": r.creado_en.isoformat() if r.creado_en else None}
            for r in rows]}
    except HTTPException:
        raise
    except Exception as e:
        _pub_id_seguro = str(pub_id).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB fallback] historial {_pub_id_seguro} falló: {_err_seguro}", exc_info=True)
        await rollback_seguro(db, "historial_aviso")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.get("/{pub_id}/similares", summary="Inmuebles similares en la zona (excluye el actual)")
async def similares(
    pub_id: int = Path(..., ge=1, le=1000000),
    limit: int = Query(4, ge=1, le=12),
    db: AsyncSession = Depends(get_session),
):
    """v15.2 bloque 'similares': misma zona (o barrio libre), ACTIVO, dueño
    activo, ordenados por confianza desc. 404 si el aviso base no existe.

    Detalle #9: excluye avisos del propio dueño (usuario_id != base) — el
    bloque es "alternativas para descubrir", no "mis otros avisos".
    """
    try:
        from app.models import Publicacion

        base = await db.get(Publicacion, pub_id)
        if not base:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        from app.repositories.publicacion_repo import dueno_activo_clause
        from app.repositories import publicacion_repo as _repo
        from app.services import publicacion_view as _view
        conds = [
            Publicacion.id != pub_id,
            Publicacion.estado == EstadoPublicacion.ACTIVO,
            dueno_activo_clause(Publicacion),
            Publicacion.usuario_id != base.usuario_id,
        ]
        if base.zona_barrio_id is not None:
            conds.append(Publicacion.zona_barrio_id == base.zona_barrio_id)
        elif base.barrio_texto:
            conds.append(Publicacion.barrio_texto == base.barrio_texto)
        else:
            return {"items": [], "total": 0}
        stmt = (
            select(Publicacion)
            .options(
                selectinload(Publicacion.imagenes),
                selectinload(Publicacion.servicios),
                selectinload(Publicacion.zona),
            )
            .where(*conds)
            .order_by(Publicacion.indice_confianza.desc(), Publicacion.id.asc())
            .limit(limit)
        )
        pubs = (await db.execute(stmt)).scalars().unique().all()
        if not pubs:
            return {"items": [], "total": 0}
        rep_map, users_map, _ = await _repo.fetch_page_aggregates(db, pubs, None)
        mostrar = await _repo.vistas_publicas(db)
        return {"items": _view.cards_for_page(pubs, rep_map, users_map, {}, None, mostrar),
                "total": len(pubs)}
    except HTTPException:
        raise
    except Exception as e:
        _pub_id_seguro = str(pub_id).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB fallback] similares {_pub_id_seguro} falló: {_err_seguro}", exc_info=True)
        await rollback_seguro(db, "similares")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.post("/{pub_id}/vista", summary="Contar vista (dedup diaria por IP, anti-inflado)")
async def registrar_vista(
    pub_id: int = Path(..., ge=1, le=1000000),
    request: Request = ...,
    db: AsyncSession = Depends(get_session),
):
    """v15.2 métrica de vistas. Pública (ver vitrinas cuenta como visita).

    Antifraude: 1 conteo por (aviso, IP, día) vía hash SHA256 (nunca la IP
    en claro) + throttle 120/min por IP.
    """
    import hashlib as _hl
    from datetime import date as _date
    ip = client_ip(request)
    await _db_rate_check_vista(db, ip)
    dia = _date.today().isoformat()
    marca = _hl.sha256(f"{ip}|{dia}".encode()).hexdigest()
    try:
        from app.models import Publicacion, VistaDedup

        p = await db.get(Publicacion, pub_id)
        if not p:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        ya = (await db.execute(
            select(VistaDedup).where(VistaDedup.publicacion_id == pub_id,
                                     VistaDedup.marca == marca)
        )).scalars().first()
        if ya:
            return {"id": pub_id, "vistas": int(p.vistas or 0), "contada": False}
        db.add(VistaDedup(publicacion_id=pub_id, marca=marca, dia=dia))
        p.vistas = int(p.vistas or 0) + 1
        await db.commit()
        return {"id": pub_id, "vistas": int(p.vistas), "contada": True}
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(db, "registrar_vista")
        _pub_id_seguro = str(pub_id).replace('\n', '').replace('\r', '')
        _err_seguro = str(exc_resumen(e)).replace('\n', '').replace('\r', '')
        logger.error(f"[DB vista] {_pub_id_seguro} falló: {_err_seguro}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@dataclass(frozen=True)
class _Escritor:
    """Datos reales de quien publica, leídos de la BD."""
    rol: str | None
    email_verificado: bool | None = None
    telefono: str | None = None
    eliminado: bool = False
    de_fuente_real: bool = False  # False: solo se conocen los claims del JWT


async def _gate_escritura(db: AsyncSession, user: dict) -> tuple[dict, bool]:
    """Guard de escritura con el rol REAL (el claim del JWT puede estar rancio).

    Orden: cuenta no eliminada -> email confirmado -> teléfono vinculado ->
    scope `publications:write` (auto-promueve ESTUDIANTE a ARRENDADOR).
    Retorna (user con el rol real y sin `scopes` rancios, hubo_promocion).
    403 por cuenta en borrado, email o scope; 400 sin teléfono.
    """
    escritor = await _escritor_real(db, user)
    user = {**user, "rol": escritor.rol or user.get("rol")}
    if escritor.eliminado:
        raise HTTPException(
            status_code=403,
            detail="Tu cuenta está en proceso de eliminación. Restáurala antes de publicar.",
        )
    if escritor.de_fuente_real:
        user.pop("scopes", None)  # sin claim, los scopes derivan del rol real
    if not user.get("email_verificado") and escritor.email_verificado is False:
        raise HTTPException(
            status_code=403,
            detail="Confirma tu correo antes de publicar (revisa tu email o solicita un código en /api/auth/otp/solicitar)",
        )
    if not (escritor.telefono or user.get("telefono_whatsapp")):
        raise HTTPException(
            status_code=400,
            detail="Vincula un número de contacto antes de publicar (Mi Perfil → Datos y contacto)",
        )
    if has_scope(user, "publications:write"):
        return user, False
    user, promovido = await _autopromover_estudiante(db, user)
    if not has_scope(user, "publications:write"):
        raise HTTPException(status_code=403, detail="Solo ARRENDADOR puede publicar (se requiere 'publications:write')")
    return user, promovido


async def _escritor_real(db: AsyncSession, user: dict) -> _Escritor:
    from app.models import Usuario
    try:
        res = await db.execute(select(Usuario).where(Usuario.id == user["id"]))
        usuario = res.scalars().first()
    except Exception as e:
        logger.warning("[publicar] lectura del usuario falló: %s", exc_resumen(e))
        await rollback_seguro(db, "_escritor_real")
        usuario = None
    if usuario is not None:
        return _Escritor(
            rol=usuario.rol,
            email_verificado=bool(getattr(usuario, "email_verificado", True)),
            telefono=getattr(usuario, "telefono_whatsapp", None),
            eliminado=getattr(usuario, "eliminado_en", None) is not None,
            de_fuente_real=True,
        )
    return _Escritor(rol=user.get("rol"))


async def _autopromover_estudiante(db: AsyncSession, user: dict) -> tuple[dict, bool]:
    """ESTUDIANTE -> ARRENDADOR al publicar por primera vez."""
    if user.get("rol") != Rol.ESTUDIANTE:
        return user, False
    from app.services import role_lifecycle
    try:
        promovido = await role_lifecycle.promover_si_estudiante(db, user["id"]) == Rol.ARRENDADOR
    except Exception as e:
        logger.warning("[publicar] auto-promoción a ARRENDADOR falló: %s", exc_resumen(e))
        promovido = False
    if not promovido:
        return user, False
    promovido_user = {**user, "rol": Rol.ARRENDADOR}
    promovido_user.pop("scopes", None)
    return promovido_user, True


async def _exigir_tipo_activo(db: AsyncSession, tipo: str, campo: str) -> None:
    """422 si el slug no existe o está inactivo (catálogo en BD o, sin BD, el estático)."""
    from app.services import housing_types
    if tipo not in await housing_types.slugs_activos(db):
        raise HTTPException(status_code=422, detail=f"{campo} '{tipo}' no válido o inactivo")


async def _auto_moderar(db: AsyncSession, nueva) -> dict | None:
    """Aplica la moderación automática (apagada por defecto: queda PENDIENTE).

    Retorna el resultado solo si auto-aprobó; un fallo deja el flujo manual.
    """
    from app.services import auto_moderation
    try:
        resultado = await auto_moderation.evaluar_y_aplicar(db, nueva)
        await db.commit()
        await db.refresh(nueva)
    except Exception as e:
        logger.warning(f"[automod] no aplicada, sigue flujo manual: {exc_resumen(e)}")
        return None
    aprobada = resultado.labels.get("auto", True) is not False and resultado.decision == auto_moderation.APPROVE
    return resultado.to_dict() if aprobada else None


async def _alertar_auto_aprobacion(db: AsyncSession, nueva, payload: PublicacionCreate, dueno_id: int,
                                   campus_ids, servicios_ids) -> None:
    """Alertas "nuevo arriendo" y aviso in-app al dueño. Best-effort, tras el commit."""
    from app.services import notifications_matcher
    try:
        await notifications_matcher.evaluar_y_crear_notificaciones(
            db, publicacion_id=nueva.id, dueno_id=dueno_id,
            titulo=nueva.titulo, canon=payload.canon_mensual,
            campus_ids=list(campus_ids), zona_id=payload.zona_barrio_id,
            tipo=payload.tipo_inmueble, servicios_ids=list(servicios_ids),
        )
        await notifications_matcher.notificar_moderacion(
            db, usuario_id=dueno_id, publicacion_id=nueva.id,
            titulo_pub=nueva.titulo, estado=EstadoPublicacion.ACTIVO,
        )
    except Exception as e:
        logger.warning("[publicar] notificaciones de auto-aprobación fallaron: %s", exc_resumen(e))


def _respuesta_creacion(nueva, trust: dict, rol: str | None, rol_actualizado: bool,
                        moderacion: dict | None) -> dict:
    pendiente = nueva.estado == EstadoPublicacion.PENDIENTE
    return {
        "id": nueva.id, "estado": nueva.estado,
        "indice_confianza": trust["indice"], "desglose": trust["desglose"], "advertencia": trust["advertencia"],
        "mensaje": ("Publicación en PENDIENTE, pendiente de moderación" if pendiente
                    else "Publicación aprobada automáticamente"),
        "rol": rol, "rol_actualizado": rol_actualizado, "moderacion": moderacion,
    }


@router.post("", response_model=PublicacionCreatedOut, status_code=status.HTTP_201_CREATED, summary="HU-005 Publicar oferta estructurada -> PENDIENTE (auto-promueve ESTUDIANTE)")
async def crear_publicacion(
    payload: PublicacionCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
    # Reintento seguro. Sin header no hay replay (el cliente ya
    # no reintenta escrituras salvo con clave).
    idempotency_key: Optional[str] = Header(None),
):
    """HU-005: publica una oferta que nace PENDIENTE de moderación.

    El rol se verifica contra la BD y un ESTUDIANTE se promueve a
    ARRENDADOR al publicar (ver `_gate_escritura`). La respuesta incluye
    `rol` y `rol_actualizado` para que el frontend refresque el perfil.
    401 sin propietario válido, 403 sin email/scope o cuenta en borrado,
    400 sin teléfono, 422 tipo inválido, 404 FK inexistente, 503 sin BD.
    """
    if not isinstance(user.get("id"), int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    user, rol_actualizado = await _gate_escritura(db, user)
    clave_idem = _idem_validar(idempotency_key)
    if clave_idem:
        previo = await _idem_replay(db, clave_idem, user["id"])
        if previo is not None:
            return previo["cuerpo"]
    # Anti-flood tras el replay: los reintentos del cliente no queman cuota.
    _check_pub_rate_limit(user["id"])
    await _exigir_tipo_activo(db, payload.tipo_inmueble, "tipo_inmueble")
    trust = view.initial_trust(payload, bool(user.get("telefono_verificado", False)))
    try:
        campus_ids, servicios_ids = await repo.validate_fks(
            db, payload.zona_barrio_id, payload.campus_ids, payload.servicios_ids
        )
        nueva = await repo.create_persisted(db, payload, user["id"], trust, campus_ids, servicios_ids)
        moderacion = await _auto_moderar(db, nueva)
        if nueva.estado == EstadoPublicacion.ACTIVO:
            await _alertar_auto_aprobacion(db, nueva, payload, user["id"], campus_ids, servicios_ids)
        resp = _respuesta_creacion(nueva, trust, user.get("rol"), rol_actualizado, moderacion)
        if clave_idem:
            ganador = await _idem_guardar(db, clave_idem, user["id"], resp)
            if ganador is not None:  # carrera: gana la respuesta ya guardada
                return ganador["cuerpo"]
        return resp
    except HTTPException:
        await rollback_seguro(db, "crear_publicacion")
        raise
    except Exception as e:
        await rollback_seguro(db, "crear_publicacion")
        logger.error(f"[DB crear] falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
