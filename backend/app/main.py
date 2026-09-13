"""
AlojaU API - FastAPI + Uvicorn (Tabla14 stack oficial)
Sprint1: HU-001,002,003,005,007,008
Responsables: Backend/Arquitectura-BD (Sprint1: Adrian, luego rotación)
"""
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from fastapi.staticfiles import StaticFiles
import logging
import os
import uuid
from app.core.config import settings
from app.routers import publicaciones, campus, auth, uploads, reportes, admin

logger = logging.getLogger("alojau")

# OLA5-M7: CSP base restrictiva (la API sirve JSON + estáticos; sin JS propio).
# Nota Vite: la CSP vive en las RESPUESTAS de la API, no afecta al dev server
# de Vite (origen distinto) ni a los fetch del frontend (los gobierna la CSP
# de la página). /docs (Swagger UI con inline JS + CDN jsdelivr) usa CSP_DOCS.
CSP_BASE = (
    "default-src 'none'; "
    "base-uri 'none'; "
    "frame-ancestors 'none'; "
    "form-action 'none'; "
    "img-src 'self'"
)
CSP_DOCS = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "img-src 'self' data: https:; "
    "frame-ancestors 'none'"
)
PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=()"

app = FastAPI(
    title="AlojaU API",
    version="0.1.0",
    description="MVP vivienda universitaria Popayán - Sprint1: búsqueda por campus, filtros, detalle, publicar PENDIENTE, índice confianza, WhatsApp",
    docs_url=None,  # F1: /docs custom con favicon AlojaU (ver abajo)
)

# CORS restringido (DoD-5): nunca "*" con credentials
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Headers de seguridad básicos (OWASP)
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "0"  # deshabilitado, CSP es mejor
    # OLA5-M7: CSP + Permissions-Policy (/docs con política propia por Swagger UI)
    if request.url.path == "/docs":
        response.headers["Content-Security-Policy"] = CSP_DOCS
    else:
        response.headers["Content-Security-Policy"] = CSP_BASE
    response.headers["Permissions-Policy"] = PERMISSIONS_POLICY
    return response

# OLA5-M7: request_id de punta a punta (logs + header de respuesta).
# Se registra DESPUÉS de security_headers para correr ANTES (outermost).
@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response

# OLA5-M7: handler global 500 con traza estructurada + request_id.
# HTTPException (401/403/404/...) pasa INTACTA (mismo status/detail/headers):
# Starlette también la dirigiría a un handler de `Exception` por MRO, así que
# el passthrough explícito es obligatorio para no romper el contrato API.
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=exc.headers,
        )
    request_id = getattr(getattr(request, "state", None), "request_id", None) or "-"
    logger.exception("[500] request_id=%s path=%s", request_id, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor", "request_id": request_id},
    )

@app.get("/health", tags=["infra"])
def health():
    """Para SLA 98% Tabla18 - Render/Railway lo usa para cold start check (15s)"""
    return {"status": "ok", "service": "AlojaU API", "version": "0.1.0", "sprint": "Sprint1 HU-001,002,003,005,007,008"}

# Static uploads (HU-005) - sirve /uploads/{uuid}.jpg
_upload_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../uploads"))
os.makedirs(_upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_upload_dir), name="uploads")

# Favicon AlojaU para /docs (F1: reemplaza rayo FastAPI por marca propia)
_static_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "static"))
os.makedirs(_static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=_static_dir), name="static")


@app.get("/docs", include_in_schema=False)
async def custom_docs():
    """Swagger UI con favicon AlojaU."""
    from fastapi.openapi.docs import get_swagger_ui_html

    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title="AlojaU API - Docs",
        swagger_favicon_url="/static/favicon.svg",
    )

# Routers Sprint1 + T1 reportes + RBAC admin
app.include_router(campus.router)
app.include_router(publicaciones.router)
app.include_router(auth.router)
app.include_router(uploads.router)
app.include_router(reportes.router)
app.include_router(admin.router)

# Legacy mock endpoints removidos: ahora en routers/publicaciones.py y routers/campus.py
# - GET /api/publicaciones?campus_id=&precio_min=&precio_max=&tipo=&servicios=  (HU-001+002)
# - GET /api/publicaciones/{id}  (HU-003+007+008)
# - POST /api/publicaciones  (HU-005 PENDIENTE, solo ARRENDADOR)
# - GET /api/campus  (HU-001)
# - POST /api/auth/register, /api/auth/login  (HU-005 auth)
