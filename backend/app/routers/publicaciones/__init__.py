"""routers/publicaciones.py - HU-001,002,003,005,007 (Sprint1) + Mis publicaciones (UX) + PA-01 Renovación
Endpoints:
  GET   /api/publicaciones?campus_id=&precio_min=&precio_max=&tipo=&servicios=  (HU-001+002)
  GET   /api/publicaciones/mias                                                 (UX: dueño, todos los estados)
  GET   /api/publicaciones/{id}                                                 (HU-003+007)
  POST  /api/publicaciones                                                      (HU-005 -> PENDIENTE, solo ARRENDADOR)
  PATCH /api/publicaciones/{id}                                                 (UX editar aviso del dueño)
  PATCH /api/publicaciones/{id}/renovar                                         (PA-01 renovación 30 días)

Consulta real con Haversine + TrustScoreEngine; sin BD responde 503.
NFR P95<500ms: query indexada (estado, zona, canon), sin N+1, Haversine en memoria/Python.

Paquete por caso de uso; este módulo solo compone los sub-routers bajo
/api/publicaciones y reexporta los nombres que usan las pruebas."""
from fastapi import APIRouter

from app.core.config import settings  # noqa: F401
from app.routers.publicaciones.busqueda import (  # noqa: F401
    list_publicaciones,
    mis_publicaciones,
)
from app.routers.publicaciones.comun import (  # noqa: F401
    _PUB_ATTEMPTS,
    _check_pub_rate_limit,
    clear_pub_rate_limit_for_tests,
)
from app.routers.publicaciones.creacion import (  # noqa: F401
    crear_publicacion,
)
from app.routers.publicaciones.detalle import (  # noqa: F401
    get_publicacion,
    historial_aviso,
    registrar_vista,
    similares,
)
from app.routers.publicaciones.edicion import (  # noqa: F401
    FotosSetIn,
    cambiar_estado_dueno,
    editar_publicacion,
    eliminar_publicacion,
    reemplazar_fotos,
    renovar_publicacion,
)
from app.routers.publicaciones import busqueda, creacion, detalle, edicion

router = APIRouter()  # cada sub-router lleva el prefijo (GET "" lo exige)
# El orden importa: rutas estáticas antes que /{id} (FastAPI no hace fallback).
for _sub in (busqueda, creacion, detalle, edicion):
    router.include_router(_sub.router)
