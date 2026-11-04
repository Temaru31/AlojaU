"""Emparejamiento de roomies: ranking HTTP (reglas + score 0-100).

GET /api/matching/candidatos (autenticado): evalúa hasta 15 candidatos
(ESTUDIANTE activos con preferencias registradas) y retorna solo el top 5
con datos básicos de contacto. La lógica vive en `app.services.matching`.

"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logseguro import exc_resumen
from app.core.security import get_current_user, id_propietario, ClaimsUsuario
from app.db.session import get_session
from app.models import Usuario
from app.services.matching import candidatos
from app.core.db_utils import rollback_seguro

logger = logging.getLogger("alojau.matching")

router = APIRouter(prefix="/api/matching", tags=["matching"])

LIMITE_BUSQUEDA = 15  # candidatos evaluados por petición
TOP_FRONTEND = 5      # solo se exponen los 5 mejores


class RoomieMatchOut(BaseModel):
    """Datos básicos del roomie compatible (sin exponer más PII)."""

    id: int
    nombre_completo: str
    email: str
    telefono_whatsapp: str | None = None
    score: int = Field(ge=0, le=100)


@router.get("/candidatos", response_model=list[RoomieMatchOut],
            summary="Top 5 de roomies compatibles (score 0-100)")
async def listar_candidatos(
    user: ClaimsUsuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Evalúa hasta 15 candidatos y retorna solo los 5 mejores.

    Filtros aplicados por el servicio: ESTUDIANTE activo, distinto del
    usuario, con preferencias registradas y sin conflictos duros
    (mascotas/invitados). Orden descendente por puntaje de compatibilidad.
    """
    uid = id_propietario(user)

    ranking = None
    try:
        yo = await db.get(Usuario, uid)
        if yo is not None:
            ranking = await candidatos(db, yo, limite=LIMITE_BUSQUEDA)
    except Exception as e:
        await rollback_seguro(db, "listar_candidatos")
        logger.error(f"[matching candidatos] DB falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")

    if ranking is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

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
