"""Destacados demo en memoria (solo dev/test sin PG; mock_enabled())."""
from datetime import datetime, timezone

from app.core.dominio import EstadoDestacado

MOCK_PLANES = [
    {"id": 1, "nombre": "Destacado 7 días", "dias": 7, "precio_cop": 15000, "prioridad": 1, "activo": True},
    {"id": 2, "nombre": "Destacado 15 días", "dias": 15, "precio_cop": 25000, "prioridad": 2, "activo": True},
    {"id": 3, "nombre": "Destacado 30 días", "dias": 30, "precio_cop": 40000, "prioridad": 3, "activo": True},
]
MOCK_DESTACADOS: list[dict] = []


def _mock_plan(plan_id: int) -> dict | None:
    return next((p for p in MOCK_PLANES if p["id"] == plan_id and p["activo"]), None)


def _mock_vigente(pub_id: int) -> bool:
    ahora = datetime.now(timezone.utc)
    return any(
        d["publicacion_id"] == pub_id
        and d["estado"] in (EstadoDestacado.PENDIENTE, EstadoDestacado.ACTIVO)
        and d["vence"] > ahora
        for d in MOCK_DESTACADOS
    )


def mock_destacados_map(ids=None) -> dict:
    """{publicacion_id: {"vence", "prioridad"}} vigentes en el store mock.

    Solo dev sin PG. Vigente = ACTIVO y vence futuro (PENDIENTE no muestra
    badge, igual que en DB). Misma forma que repo.fetch_destacados_map.
    """
    ahora = datetime.now(timezone.utc)
    prio = {p["id"]: p.get("prioridad", 0) for p in MOCK_PLANES}
    wanted = set(ids) if ids is not None else None
    out: dict = {}
    for d in MOCK_DESTACADOS:
        if d.get("estado") != EstadoDestacado.ACTIVO:
            continue
        vence = d.get("vence")
        if vence is None:
            continue
        if getattr(vence, "tzinfo", None) is None:
            vence = vence.replace(tzinfo=timezone.utc)
        if vence <= ahora:
            continue
        pid = d["publicacion_id"]
        if wanted is not None and pid not in wanted:
            continue
        cur = {"vence": d["vence"], "prioridad": int(prio.get(d["plan_id"], 0) or 0)}
        prev = out.get(pid)
        if prev is None or cur["prioridad"] > prev["prioridad"]:
            out[pid] = cur
    return out
