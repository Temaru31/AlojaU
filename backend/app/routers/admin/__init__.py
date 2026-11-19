"""routers/admin.py - Panel admin RBAC (métricas, moderación, control maestro).

Endpoints (todos solo ADMIN via require_admin -> 401 sin token, 403 sin rol):
  GET    /api/admin/metricas                    (totales plataforma)
  GET    /api/admin/pendientes?page&size        (bandeja PENDIENTE paginada)
  PATCH  /api/admin/publicaciones/{id}          (cambiar estado: aprobar/rechazar/pausar + audit)
  DELETE /api/admin/publicaciones/{id}          (eliminar, 204; hijos por ON DELETE CASCADE)

Sin BD responde 503 (no hay datos de respaldo).

Paquete por caso de uso; este módulo solo compone los sub-routers bajo
/api/admin y reexporta los nombres que usan las pruebas."""
from fastapi import APIRouter

from app.core.config import settings  # noqa: F401
from app.routers.admin.esquemas import (  # noqa: F401
    BulkEstadoIn,
    CambioEstadoIn,
    MetricasOut,
)
from app.routers.admin.moderacion import (  # noqa: F401
    _bulk_cambiar_estado,
    cambiar_estado,
    eliminar,
)
from app.routers.admin.panel import (  # noqa: F401
    metricas,
    pendientes,
    ver_auditoria,
)
from app.routers.admin import panel, moderacion, cuentas

router = APIRouter(prefix="/api/admin", tags=["admin"])
# El orden importa: rutas estáticas antes que /{id} (FastAPI no hace fallback).
for _sub in (panel, moderacion, cuentas):
    router.include_router(_sub.router)
