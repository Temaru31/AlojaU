"""Escritura de avisos: validación de FKs, creación y renovación de vigencia."""
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dominio import EstadoPublicacion


async def validate_fks(db: AsyncSession, zona_id: int | None, campus_ids: List[int], servicios_ids: List[int]):
    """FK estrictas + dedup (404 si zona/campus inactivo/servicio falta).
    zona_id None = barrio libre (barrio_texto): se omite el chequeo.
    Uso: routers/publicaciones.py::crear_publicacion. Ej: cids, sids = await validate_fks(db, 1, [1, 1], [1])."""
    from fastapi import HTTPException

    from app.models import CampusUniversitario, ServicioCatalogo, ZonaBarrio

    campus_ids = list(dict.fromkeys(campus_ids or []))
    servicios_ids = list(dict.fromkeys(servicios_ids))
    if zona_id is not None and not await db.get(ZonaBarrio, zona_id):
        raise HTTPException(status_code=404, detail=f"zona_barrio_id {zona_id} no existe")
    for cid in campus_ids:
        campus = await db.get(CampusUniversitario, cid)
        if not campus or not campus.activo:
            raise HTTPException(status_code=404, detail=f"campus_id {cid} no existe o inactivo")
    for sid in servicios_ids:
        if not await db.get(ServicioCatalogo, sid):
            raise HTTPException(status_code=404, detail=f"servicio_id {sid} no existe")
    return campus_ids, servicios_ids


async def _distancia_a_campus(db: AsyncSession, campus_id: int, latitud, longitud) -> float | None:
    """Distancia geodésica aviso→campus; None si falta alguna coordenada."""
    from app.models import CampusUniversitario
    from app.services.haversine import haversine_m

    if latitud is None or longitud is None:
        return None
    campus = await db.get(CampusUniversitario, campus_id)
    if campus is None or campus.latitud is None or campus.longitud is None:
        return None
    return haversine_m(float(latitud), float(longitud), float(campus.latitud), float(campus.longitud))


async def _vincular_campus(db: AsyncSession, pub_id: int, campus_ids, latitud, longitud) -> None:
    """Enlaza los campus elegidos con su distancia.

    El trigger trg_publicacion_recalcular_distancias ya insertó filas para TODOS
    los lugares activos en el flush anterior; reescribir las elegidas (mismo
    valor) evita violar la PK (publicacion_id, campus_id).
    """
    from sqlalchemy import delete as sa_delete

    from app.models import PublicacionCampus

    await db.execute(
        sa_delete(PublicacionCampus).where(
            PublicacionCampus.publicacion_id == pub_id,
            PublicacionCampus.campus_id.in_(campus_ids),
        )
    )
    for cid in campus_ids:
        dist = await _distancia_a_campus(db, cid, latitud, longitud)
        db.add(PublicacionCampus(publicacion_id=pub_id, campus_id=cid, distancia_geodesica_m=dist))


async def create_persisted(db, payload, user_id: int, trust: dict, campus_ids, servicios_ids):
    """Persiste PENDIENTE + links N:M + fotos + audit (requiere FK validadas).
    Uso: routers/publicaciones.py::crear_publicacion.
    Ej: nueva = await create_persisted(db, payload, 1, trust, [1], [1]).
    """
    from datetime import datetime, timezone, timedelta

    from app.models import (
        ImagenPublicacion,
        Publicacion,
        PublicacionServicio,
        PublicacionesAudit as PublicacionAudit,
    )

    nueva = Publicacion(
        usuario_id=user_id,
        zona_barrio_id=payload.zona_barrio_id,
        barrio_texto=(payload.barrio_texto or None),
        titulo=payload.titulo,
        descripcion=payload.descripcion,
        tipo_inmueble=payload.tipo_inmueble,
        canon_mensual=payload.canon_mensual,
        deposito_requerido=payload.deposito_requerido,
        reglas_convivencia=payload.reglas_convivencia,
        direccion_referencial=payload.direccion_referencial,
        latitud=payload.latitud,
        longitud=payload.longitud,
        estado=EstadoPublicacion.PENDIENTE,
        indice_confianza=trust["indice"],
        fecha_expiracion=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(nueva)
    await db.flush()
    await _vincular_campus(db, nueva.id, campus_ids, payload.latitud, payload.longitud)
    for sid in servicios_ids:
        db.add(PublicacionServicio(publicacion_id=nueva.id, servicio_id=sid))
    for idx, url in enumerate(payload.fotos, start=1):
        db.add(ImagenPublicacion(publicacion_id=nueva.id, url=str(url), orden=idx))
    db.add(
        PublicacionAudit(
            publicacion_id=nueva.id, usuario_id=nueva.usuario_id, evento="CREATED", detalle=EstadoPublicacion.PENDIENTE
        )
    )
    await db.commit()
    await db.refresh(nueva)
    return nueva


def _nueva_expiracion(fecha_anterior, now):
    """30 días reales: desde la expiración si sigue vigente, o desde ahora si ya venció."""
    from datetime import timedelta

    return max(fecha_anterior, now) + timedelta(days=30)


def _detalle_renovacion(fecha_anterior, fecha_nueva, estado_anterior, estado_nuevo) -> str:
    """JSON de la fila de auditoría RENEWED."""
    import json

    return json.dumps({
        "fecha_expiracion_anterior": fecha_anterior.isoformat(),
        "fecha_expiracion_nueva": fecha_nueva.isoformat(),
        "estado_anterior": estado_anterior,
        "estado_nuevo": estado_nuevo,
    }, ensure_ascii=False)


async def renovar_publicacion(db: AsyncSession, pub_id: int, user_id: int) -> dict:
    """Renueva la vigencia de una publicación por exactamente 30 días calendario (PA-01).

    Reglas de negocio:
    - Solo el dueño (user_id == publicacion.usuario_id) puede renovar.
    - Si fecha_expiracion > ahora: nueva = fecha_expiracion_actual + 30 días.
    - Si ya venció:               nueva = ahora + 30 días.
    - EXPIRADO → estado pasa a ACTIVO tras la renovación.
    - RECHAZADO / DESACTIVADO → fecha renovada pero estado no cambia.
    - Genera fila de auditoría con evento 'RENEWED'.

    Uso: routers/publicaciones.py::renovar.
    Ej: datos = await renovar_publicacion(db, 25, 1).
    Retorna dict con id, estado, fecha_expiracion_anterior, fecha_expiracion_nueva, dias_agregados, mensaje.
    Lanza HTTPException 404/403.
    """
    from datetime import datetime, timezone
    from fastapi import HTTPException
    from app.models import Publicacion, PublicacionesAudit as PublicacionAudit

    p = await db.get(Publicacion, pub_id)
    if not p:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    if p.usuario_id != user_id:
        raise HTTPException(status_code=403, detail="No tienes permisos para renovar esta publicación.")

    now = datetime.now(timezone.utc)
    fecha_anterior = p.fecha_expiracion
    if fecha_anterior.tzinfo is None:
        fecha_anterior = fecha_anterior.replace(tzinfo=timezone.utc)
    fecha_nueva = _nueva_expiracion(fecha_anterior, now)

    estado_anterior = p.estado
    # RECHAZADO y DESACTIVADO conservan su estado por regla de negocio explícita.
    if p.estado == EstadoPublicacion.EXPIRADO:
        p.estado = EstadoPublicacion.ACTIVO
    p.fecha_expiracion = fecha_nueva
    p.fecha_renovacion = now

    detalle = _detalle_renovacion(fecha_anterior, fecha_nueva, estado_anterior, p.estado)
    db.add(PublicacionAudit(
        publicacion_id=p.id,
        usuario_id=user_id,
        evento="RENEWED",
        detalle=detalle,
    ))

    await db.commit()
    await db.refresh(p)

    return {
        "id": p.id,
        "estado": p.estado,
        "fecha_expiracion_anterior": fecha_anterior,
        "fecha_expiracion_nueva": fecha_nueva,
        "dias_agregados": 30,
        "mensaje": "La publicación fue renovada exitosamente.",
    }
