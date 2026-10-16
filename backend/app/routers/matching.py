"""MOCKUP (no implementado): futuro endpoint de emparejamiento de roomies.

Contrato previsto: GET /api/matching/candidatos?limite=20 (autenticado,
rol ESTUDIANTE) -> ranking de `app.services.matching.candidatos`:
[{"usuario_id", "score", "detalle": {aseo, sueno, invitados, pagos,
caracter}}]. Por ahora responde 501 con este contrato.
"""
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/matching", tags=["matching"])


@router.get("/candidatos", summary="[MOCKUP] Ranking de roomies (no implementado)")
async def candidatos_mockup(limite: int = 20):
    raise HTTPException(status_code=501, detail={
        "mensaje": "Mockup: emparejamiento aún no implementado a nivel HTTP.",
        "contrato_futuro": {
            "metodo": "GET /api/matching/candidatos",
            "auth": "Bearer JWT, rol ESTUDIANTE",
            "query": {"limite": "int 1-50, default 20"},
            "respuesta_200": [
                {"usuario_id": 2, "score": 94,
                 "detalle": {"aseo": 1.0, "sueno": 1.0, "invitados": 1.0,
                             "pagos": 1.0, "caracter": 0.6}},
            ],
            "filtros": "solo ESTUDIANTE activos con preferencias + "
                        "filtros duros (acepta_mascotas/acepta_invitados)",
        },
    })
