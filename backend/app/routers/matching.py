"""Emparejamiento de roomies: ranking HTTP (reglas + score 0-100).

GET /api/matching/candidatos (autenticado): evalúa hasta 15 candidatos
(ESTUDIANTE activos con preferencias registradas) y retorna solo el top 5
con datos básicos de contacto. La lógica vive en `app.services.matching`.

Mock dev (_mock_enabled): opera sobre MOCK_USERS en memoria.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logseguro import exc_resumen
from app.core.security import get_current_user
from app.db.session import get_session
from app.models import Usuario
from app.services.matching import candidatos

logger = logging.getLogger("alojau.matching")

router = APIRouter(prefix="/api/matching", tags=["matching"])

LIMITE_BUSQUEDA = 15  # candidatos evaluados por petición
TOP_FRONTEND = 5      # solo se exponen los 5 mejores


def _mock_enabled() -> bool:
    return bool(getattr(settings, "mock_enabled", False))


class RoomieMatchOut(BaseModel):
    """Datos básicos del roomie compatible (sin exponer más PII)."""

    id: int
    nombre_completo: str
    email: str
    telefono_whatsapp: str | None = None
    score: int = Field(ge=0, le=100)


class _MockResult:
    def __init__(self, rows: list):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows


class _MockSession:
    """Sesión mínima para reutilizar `candidatos` sin PostgreSQL (dev)."""

    def __init__(self, rows: list):
        self._rows = rows

    async def execute(self, stmt):
        return _MockResult(self._rows)


async def _ranking_mock(usuario_id: int) -> list[dict]:
    """Fallback dev: ranking sobre MOCK_USERS (misma semántica del servicio)."""
    from .auth import MOCK_USERS

    rows, yo = [], None
    for email, m in MOCK_USERS.items():
        if not isinstance(m, dict) or m.get("rol") != "ESTUDIANTE":
            continue
        u = Usuario(
            nombre_completo=m.get("nombre_completo") or "Estudiante",
            email=email,
            password_hash="",
            rol="ESTUDIANTE",
            telefono_whatsapp=m.get("telefono_whatsapp"),
        )
        u.id = m.get("id")
        u.eliminado_en = None
        u.preferencias = m.get("preferencias") or {}
        if u.id == usuario_id:
            yo = u
        else:
            rows.append(u)
    if yo is None:
        return []
    return await candidatos(_MockSession(rows), yo, limite=LIMITE_BUSQUEDA)


@router.get("/candidatos", response_model=list[RoomieMatchOut],
            summary="Top 5 de roomies compatibles (score 0-100)")
async def listar_candidatos(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Evalúa hasta 15 candidatos y retorna solo los 5 mejores.

    Filtros aplicados por el servicio: ESTUDIANTE activo, distinto del
    usuario, con preferencias registradas y sin conflictos duros
    (mascotas/invitados). Orden descendente por puntaje de compatibilidad.
    """
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")

    ranking = None
    try:
        yo = await db.get(Usuario, uid)
        if yo is not None:
            ranking = await candidatos(db, yo, limite=LIMITE_BUSQUEDA)
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[matching candidatos] DB falló: {exc_resumen(e)}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")

    if ranking is None:
        if not _mock_enabled():
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        ranking = await _ranking_mock(uid)

    return [
        RoomieMatchOut(
            id=r["usuario"].id,
            nombre_completo=r["usuario"].nombre_completo,
            email=r["usuario"].email,
            telefono_whatsapp=r["usuario"].telefono_whatsapp,
            score=r["score"],
        )
        for r in ranking[:TOP_FRONTEND]
    ]
