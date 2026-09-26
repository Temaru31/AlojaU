"""M2 tipos de vivienda dinámicos: catálogo público + CRUD admin.

- GET /api/housing-types (público, solo activos, caché 5min).
- GET /api/admin/housing-types (ADMIN, todos con esta_activo).
- POST /api/admin/housing-types (ADMIN, crea slug + audit SETTINGS).
- PATCH /api/admin/housing-types/{slug} (ADMIN, edita + audit, invalida caché).
- DELETE /api/admin/housing-types/{slug} (ADMIN, FK RESTRICT -> 409 si en uso).

Mock dev (_mock_enabled): opera sobre MOCK_TIPOS en memoria (misma forma).
"""
import re

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_admin
from app.core.config import settings
from app.db.session import get_session

import logging
logger = logging.getLogger("alojau.housing_types")

router_public = APIRouter(prefix="/api/housing-types", tags=["housing-types"])
router_admin = APIRouter(prefix="/api/admin/housing-types", tags=["admin-housing-types"])


def _mock_enabled() -> bool:
    return bool(getattr(settings, "mock_enabled", False))


_SLUG_RE = re.compile(r"^[A-Z0-9_]{3,40}$")


def _validar_slug(slug: str) -> str:
    s = (slug or "").strip().upper()
    if not _SLUG_RE.match(s):
        raise HTTPException(status_code=422, detail="slug debe ser MAYUSCULAS con _ (3-40)")
    return s


class HousingOut(BaseModel):
    slug: str
    nombre_visible: str
    descripcion_tooltip: str | None = None
    icono: str | None = None
    esta_activo: bool = True


class HousingCreateIn(BaseModel):
    slug: str = Field(min_length=3, max_length=40)
    nombre_visible: str = Field(min_length=3, max_length=80)
    descripcion_tooltip: str | None = Field(default=None, max_length=500)
    icono: str | None = Field(default=None, max_length=20)
    esta_activo: bool = True


class HousingUpdateIn(BaseModel):
    nombre_visible: str | None = Field(default=None, min_length=3, max_length=80)
    descripcion_tooltip: str | None = Field(default=None, max_length=500)
    icono: str | None = Field(default=None, max_length=20)
    esta_activo: bool | None = None


def _to_out(r) -> dict:
    return {
        "slug": r.slug, "nombre_visible": r.nombre_visible,
        "descripcion_tooltip": r.descripcion_tooltip, "icono": r.icono,
        "esta_activo": bool(r.esta_activo),
    }


async def _auditar(db: AsyncSession, admin: dict, detalle: str) -> None:
    try:
        from app.models import PublicacionesAudit
        db.add(PublicacionesAudit(
            publicacion_id=None,
            usuario_id=admin.get("id") if isinstance(admin.get("id"), int) else None,
            evento="SETTINGS",
            detalle=detalle[:500],
        ))
    except Exception:
        pass


@router_public.get("", response_model=list[HousingOut], summary="Catálogo público de tipos (solo activos)")
async def listar_publicos(db: AsyncSession = Depends(get_session)):
    from app.services import housing_types as _ht
    try:
        return await _ht.get_activos(db)
    except Exception:
        return [dict(t) for t in _ht.MOCK_TIPOS if t.get("esta_activo")]


@router_admin.get("", response_model=list[HousingOut], summary="Admin: listar todos los tipos")
async def listar_admin(
    db: AsyncSession = Depends(get_session),
    admin: dict = Depends(require_admin),
):
    try:
        from app.models import HousingType
        rows = (await db.execute(select(HousingType).order_by(HousingType.slug.asc()))).scalars().all()
        return [_to_out(r) for r in rows]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[housing admin listar] falló: {e!r}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    from app.services.housing_types import MOCK_TIPOS as _MT
    return [dict(t) for t in _MT]


@router_admin.post("", response_model=HousingOut, status_code=201, summary="Admin: crear tipo")
async def crear_tipo(
    data: HousingCreateIn,
    db: AsyncSession = Depends(get_session),
    admin: dict = Depends(require_admin),
):
    slug = _validar_slug(data.slug)
    try:
        from app.models import HousingType
        from app.services import housing_types as _ht
        existente = await db.get(HousingType, slug)
        if existente:
            raise HTTPException(status_code=409, detail=f"slug '{slug}' ya existe")
        nuevo = HousingType(
            slug=slug, nombre_visible=data.nombre_visible.strip(),
            descripcion_tooltip=(data.descripcion_tooltip or "").strip() or None,
            icono=(data.icono or "").strip() or None,
            esta_activo=bool(data.esta_activo),
        )
        db.add(nuevo)
        await _auditar(db, admin, f"housing_types crear {slug}")
        await db.commit()
        await db.refresh(nuevo)
        _ht.clear_cache()
        return _to_out(nuevo)
    except HTTPException:
        try:
            await db.rollback()
        except Exception:
            pass
        raise
    except IntegrityError:
        try:
            await db.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=409, detail=f"slug '{slug}' ya existe")
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[housing crear] falló: {e!r}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    # Mock dev
    from app.services import housing_types as _ht
    if any(t["slug"] == slug for t in _ht.MOCK_TIPOS):
        raise HTTPException(status_code=409, detail=f"slug '{slug}' ya existe")
    nuevo = {
        "slug": slug, "nombre_visible": data.nombre_visible.strip(),
        "descripcion_tooltip": data.descripcion_tooltip, "icono": data.icono,
        "esta_activo": bool(data.esta_activo),
    }
    _ht.MOCK_TIPOS.append(nuevo)
    _ht.clear_cache()
    return nuevo


@router_admin.patch("/{slug}", response_model=HousingOut, summary="Admin: editar tipo")
async def editar_tipo(
    slug: str = Path(..., min_length=3, max_length=40),
    data: HousingUpdateIn = ...,
    db: AsyncSession = Depends(get_session),
    admin: dict = Depends(require_admin),
):
    slug = _validar_slug(slug)
    cambios = {k: v for k, v in data.model_dump().items() if v is not None}
    if not cambios:
        raise HTTPException(status_code=422, detail="Envía al menos 1 campo")
    try:
        from app.models import HousingType
        from app.services import housing_types as _ht
        row = await db.get(HousingType, slug)
        if not row:
            raise HTTPException(status_code=404, detail="Tipo no encontrado")
        if "nombre_visible" in cambios:
            row.nombre_visible = cambios["nombre_visible"].strip()
        if "descripcion_tooltip" in cambios:
            row.descripcion_tooltip = (cambios["descripcion_tooltip"] or "").strip() or None
        if "icono" in cambios:
            row.icono = (cambios["icono"] or "").strip() or None
        if "esta_activo" in cambios:
            row.esta_activo = bool(cambios["esta_activo"])
        await _auditar(db, admin, f"housing_types editar {slug}: {sorted(cambios.keys())}")
        await db.commit()
        await db.refresh(row)
        _ht.clear_cache()
        return _to_out(row)
    except HTTPException:
        try:
            await db.rollback()
        except Exception:
            pass
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[housing editar] falló: {e!r}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    from app.services import housing_types as _ht
    for t in _ht.MOCK_TIPOS:
        if t["slug"] == slug:
            for k, v in cambios.items():
                t[k] = v
            _ht.clear_cache()
            return dict(t)
    raise HTTPException(status_code=404, detail="Tipo no encontrado")


@router_admin.delete("/{slug}", status_code=204, summary="Admin: eliminar tipo (RESTRICT si en uso)")
async def eliminar_tipo(
    slug: str = Path(..., min_length=3, max_length=40),
    db: AsyncSession = Depends(get_session),
    admin: dict = Depends(require_admin),
):
    from fastapi import Response
    slug = _validar_slug(slug)
    try:
        from app.models import HousingType, Publicacion
        row = await db.get(HousingType, slug)
        if not row:
            raise HTTPException(status_code=404, detail="Tipo no encontrado")
        en_uso = (await db.execute(
            select(Publicacion.id).where(Publicacion.tipo_inmueble == slug).limit(1)
        )).scalars().first()
        if en_uso is not None:
            raise HTTPException(status_code=409, detail=f"slug '{slug}' en uso por avisos (RESTRICT)")
        await db.delete(row)
        await _auditar(db, admin, f"housing_types eliminar {slug}")
        await db.commit()
        from app.services import housing_types as _ht
        _ht.clear_cache()
        return Response(status_code=204)
    except HTTPException:
        try:
            await db.rollback()
        except Exception:
            pass
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[housing eliminar] falló: {e!r}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    # Mock dev: RESTRICT si algún MOCK_PUB lo usa.
    from app.services import housing_types as _ht
    try:
        from app.routers.publicaciones import MOCK_PUBS as _MP
        if any(p.get("tipo_inmueble") == slug for p in _MP):
            raise HTTPException(status_code=409, detail=f"slug '{slug}' en uso (mock RESTRICT)")
    except HTTPException:
        raise
    except Exception:
        pass
    for i, t in enumerate(_ht.MOCK_TIPOS):
        if t["slug"] == slug:
            _ht.MOCK_TIPOS.pop(i)
            _ht.clear_cache()
            from fastapi import Response as _R
            return _R(status_code=204)
    raise HTTPException(status_code=404, detail="Tipo no encontrado")
