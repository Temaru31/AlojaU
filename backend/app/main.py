"""
AlojaU API - FastAPI + Uvicorn (Tabla14 stack oficial)
Sprint1: HU-001,002,003,005,007,008
Responsables: Backend/Arquitectura-BD (Sprint1: Adrian, luego rotación)
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from fastapi.staticfiles import StaticFiles
import os
from app.core.config import settings
from app.routers import publicaciones, campus, auth, uploads

app = FastAPI(
    title="AlojaU API",
    version="0.1.0",
    description="MVP vivienda universitaria Popayán - Sprint1: búsqueda por campus, filtros, detalle, publicar PENDIENTE, índice confianza, WhatsApp",
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
    return response

@app.get("/health", tags=["infra"])
def health():
    """Para SLA 98% Tabla18 - Render/Railway lo usa para cold start check (15s)"""
    return {"status": "ok", "service": "AlojaU API", "version": "0.1.0", "sprint": "Sprint1 HU-001,002,003,005,007,008"}

# Static uploads (HU-005) - sirve /uploads/{uuid}.jpg
_upload_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../uploads"))
os.makedirs(_upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_upload_dir), name="uploads")

# Routers Sprint1
app.include_router(campus.router)
app.include_router(publicaciones.router)
app.include_router(auth.router)
app.include_router(uploads.router)

# Legacy mock endpoints removidos: ahora en routers/publicaciones.py y routers/campus.py
# - GET /api/publicaciones?campus_id=&precio_min=&precio_max=&tipo=&servicios=  (HU-001+002)
# - GET /api/publicaciones/{id}  (HU-003+007+008)
# - POST /api/publicaciones  (HU-005 PENDIENTE, solo ARRENDADOR)
# - GET /api/campus  (HU-001)
# - POST /api/auth/register, /api/auth/login  (HU-005 auth)
