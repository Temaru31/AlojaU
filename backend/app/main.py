"""
AlojaU API - FastAPI + Uvicorn (Tabla14 stack oficial)
Sprint1: HU-001,002,003,005,007,008
Responsables: Backend/Arquitectura-BD (Sprint1: Adrian, luego rotación)
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import publicaciones, campus, auth

app = FastAPI(
    title="AlojaU API",
    version="0.1.0",
    description="MVP vivienda universitaria Popayán - Sprint1: búsqueda por campus, filtros, detalle, publicar PENDIENTE, índice confianza, WhatsApp",
)

# CORS para Vite (localhost:5173) y Vercel
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", tags=["infra"])
def health():
    """Para SLA 98% Tabla18 - Render/Railway lo usa para cold start check (15s)"""
    return {"status": "ok", "service": "AlojaU API", "version": "0.1.0", "sprint": "Sprint1 HU-001,002,003,005,007,008"}

# Routers Sprint1
app.include_router(campus.router)
app.include_router(publicaciones.router)
app.include_router(auth.router)

# Legacy mock endpoints removidos: ahora en routers/publicaciones.py y routers/campus.py
# - GET /api/publicaciones?campus_id=&precio_min=&precio_max=&tipo=&servicios=  (HU-001+002)
# - GET /api/publicaciones/{id}  (HU-003+007+008)
# - POST /api/publicaciones  (HU-005 PENDIENTE, solo ARRENDADOR)
# - GET /api/campus  (HU-001)
# - POST /api/auth/register, /api/auth/login  (HU-005 auth)
