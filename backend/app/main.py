"""
AlojaU API - FastAPI + Uvicorn
Responsables: Backend/Arquitectura-BD (Sprint 1: Adrian, luego rotación)
Ver Tabla14: stack oficial PDF p22
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AlojaU API", version="0.1.0", description="MVP vivienda universitaria Popayán")

# CORS para Vite (localhost:5173) y Vercel
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

@app.get("/health", tags=["infra"])
def health():
    """Para SLA 98% Tabla16:27 - Render/Railway lo usa para cold start check"""
    return {"status": "ok", "service": "AlojaU API", "version": "0.1.0"}

@app.get("/api/campus", tags=["catalogo"])
def list_campus():
    """TODO HU-001 - Reemplazar por DB. Seed pendiente: coordenadas Tulcán etc (ver 5.14.2)"""
    return [
        {"id": 1, "institucion": "Universidad del Cauca", "nombre_sede": "Campus Tulcán", "lat": 2.443, "lng": -76.606},
        {"id": 2, "institucion": "Unicomfacauca", "nombre_sede": "Claustro", "lat": 2.441, "lng": -76.602},
    ]

@app.get("/api/publicaciones", tags=["publicaciones"])
def list_publicaciones(campus_id: int = None, precio_min: int = None, precio_max: int = None):
    """
    HU-001 + HU-002: búsqueda por campus + filtros precio/tipo/servicios
    TODO: usar SQLAlchemy async + asyncpg + Haversine. Por ahora MOCK para que frontend no se bloquee esperando BD.
    Cuando BD esté lista, cambiar mock por: SELECT + JOIN publicacion_campus + cálculo distancia
    """
    mock = [
        {"id": 1, "titulo": "Habitación cerca Tulcán", "canon": 450000, "zona": "Pandiguando", "dist_m": 320, "indice_confianza": 85, "estado": "ACTIVO", "fotos": 4},
        {"id": 2, "titulo": "Apartaestudio amoblado", "canon": 700000, "zona": "Centro", "dist_m": 850, "indice_confianza": 62, "estado": "ACTIVO", "fotos": 3},
    ]
    # Filtro mock
    if precio_min: mock = [m for m in mock if m["canon"] >= precio_min]
    if precio_max: mock = [m for m in mock if m["canon"] <= precio_max]
    return mock

@app.get("/api/publicaciones/{pub_id}", tags=["publicaciones"])
def get_publicacion(pub_id: int):
    """HU-003 detalle + HU-007 índice. TODO: traer servicios, reglas, fotos, TrustScoreEngine"""
    return {"id": pub_id, "titulo": "Habitación cerca Tulcán", "canon": 450000, "deposito": 200000, "servicios": ["WiFi","Baño privado"], "reglas": "No mascotas", "indice_confianza": 85, "desglose": {"completitud":40,"telefono":20,"fotos":15,"vigencia":0,"reportes":10}, "telefono_whatsapp": "573001234567"}

# TODO HU-005 POST /api/publicaciones (PENDIENTE) - solo ARRENDADOR
# TODO HU-006 PATCH /api/publicaciones/{id}/renovar - 30 días
# TODO HU-010 /api/admin/moderar - solo ADMIN
