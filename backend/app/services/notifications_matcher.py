"""Matching engine de alertas (Fase 2): aviso ACTIVO -> notificaciones in-app.

Diseño (ver docs/ROADMAP_NOTIFICACIONES.md):
- Set-based: UN solo INSERT..SELECT por aviso (sin N+1, sin loops Python).
- Dedupe por `evento_id` vía ON CONFLICT DO NOTHING (reintentos seguros sin
  prohibir repeticiones futuras del mismo tipo).
- Savepoint interno (`begin_nested`): si algo falla, solo se revierte este
  bloque; la transacción principal (approve/publish) sigue intacta.
- Nunca lanza: ante cualquier error retorna 0 con warning (el endpoint que
  llama NO necesita try/except, pero puede añadirlo).
- Todo parametrizado (ORM + literales): apto CodeQL, cero f-strings SQL.

Filtros (NULL/vacío = comodín): activa, rango de canon, campus (set
autovinculado por trigger), zona exacta, tipo, servicios contenidos (@>).
Auto-exclusión del dueño.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy import func, literal, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("alojau.notificaciones")

# Retención: la purga corre en el mismo bloque de escritura (jamás en GET).
PURGA_DIAS = 90
PURGA_TOPE_FILAS = 500


def _titulo_para(titulo_pub: str | None, pub_id: int) -> str:
    base = (titulo_pub or "").strip() or f"aviso {pub_id}"
    return f"Nuevo arriendo: {base[:110]}"


def _cuerpo_para(canon, tipo: str | None) -> str:
    partes: list[str] = []
    try:
        partes.append(f"${int(canon):,}".replace(",", "."))
    except Exception:
        pass
    if tipo:
        partes.append(str(tipo).replace("_", " ").title())
    return " · ".join(partes)


async def evaluar_y_crear_notificaciones(
    db: AsyncSession,
    *,
    publicacion_id: int,
    dueno_id: int,
    titulo: str | None,
    canon,
    campus_ids: list[int] | None,
    zona_id: int | None,
    tipo: str | None,
    servicios_ids: list[int] | None,
) -> int:
    """Crea las notificaciones de un aviso recién ACTIVO. Retorna creadas.

    Primitivas (no ORM): testeable sin flush hazards y sin importar routers.
    """
    try:
        from app.models import BusquedaGuardada, Notificacion

        campus = [int(c) for c in (campus_ids or [])]
        pub_serv = [int(s) for s in (servicios_ids or [])]
        evento = f"nuevo_arriendo:{int(publicacion_id)}"
        titulo_txt = _titulo_para(titulo, int(publicacion_id))
        cuerpo_txt = _cuerpo_para(canon, tipo)

        conds = [
            BusquedaGuardada.activa.is_(True),
            BusquedaGuardada.usuario_id != int(dueno_id),
            or_(BusquedaGuardada.precio_min.is_(None),
                BusquedaGuardada.precio_min <= canon),
            or_(BusquedaGuardada.precio_max.is_(None),
                BusquedaGuardada.precio_max >= canon),
            or_(BusquedaGuardada.zona_barrio_id.is_(None),
                BusquedaGuardada.zona_barrio_id == zona_id),
            or_(BusquedaGuardada.tipo.is_(None),
                BusquedaGuardada.tipo == tipo),
            # Vacía ({}) casa con todo; si no, debe estar contenida (@>).
            or_(func.cardinality(BusquedaGuardada.servicios_ids) == 0,
                BusquedaGuardada.servicios_ids.contained_by(pub_serv)),
        ]
        # in_([]) es siempre-falso: sin campus vinculados no se filtra.
        if campus:
            conds.append(or_(BusquedaGuardada.campus_id.is_(None),
                             BusquedaGuardada.campus_id.in_(campus)))

        sel = (
            select(
                BusquedaGuardada.usuario_id,
                literal(int(publicacion_id)),
                BusquedaGuardada.id,
                literal(evento),
                literal("nuevo_arriendo"),
                literal(titulo_txt),
                literal(cuerpo_txt),
            )
            .where(*conds)
        )
        ins = (
            pg_insert(Notificacion)
            .from_select(
                ["usuario_id", "publicacion_id", "busqueda_id", "evento_id",
                 "tipo", "titulo", "cuerpo"],
                sel,
            )
            .on_conflict_do_nothing(constraint="uq_notif_usuario_evento")
        )
        async with db.begin_nested():
            res = await db.execute(ins)
            creadas = res.rowcount or 0
            # Purga TTL acotada en escritura (nunca en GET de lectura).
            corte = datetime.now(timezone.utc) - timedelta(days=PURGA_DIAS)
            sub = (
                select(Notificacion.id)
                .where(Notificacion.created_at < corte)
                .limit(PURGA_TOPE_FILAS)
            )
            await db.execute(
                Notificacion.__table__.delete().where(Notificacion.id.in_(sub))
            )
        return int(creadas or 0)
    except Exception as e:
        # PROHIBIDO db.rollback() aquí: revertiría la transacción principal
        # (el approve). El `begin_nested` ya deshizo solo este bloque.
        from app.core.logseguro import exc_resumen
        logger.warning(f"[matcher] enqueue omitido (flujo principal intacto): {exc_resumen(e)}")
        return 0
