"""
routers/uploads.py - HU-005 Subida real fotos 3-10
POST /api/publicaciones/upload -> {"urls": ["https://.../uploads/uuid.jpg", ...]}
Seguridad: solo ARRENDADOR, valida 3-10 archivos, 5MB c/u, image/*, nombre seguro uuid
"""
import os
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import JSONResponse

from app.core.security import require_arrendador

router = APIRouter(prefix="/api/publicaciones/upload", tags=["uploads"])

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "../../uploads")
UPLOAD_DIR = os.path.abspath(UPLOAD_DIR)
MAX_FILES = 10
MIN_FILES = 3
MAX_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/jpg"}

os.makedirs(UPLOAD_DIR, exist_ok=True)

def _validate_file(file: UploadFile):
    if file.content_type not in ALLOWED_TYPES and not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail=f"Archivo {file.filename} no es imagen (solo image/*)")
    # extension segura
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        # si no tiene ext pero content_type es imagen, asignar .jpg
        if file.content_type == "image/png":
            ext = ".png"
        elif file.content_type == "image/webp":
            ext = ".webp"
        else:
            ext = ".jpg"
    return ext

@router.post("", summary="HU-005 Upload 3-10 imágenes (solo ARRENDADOR)")
async def upload_fotos(
    request: Request,
    files: List[UploadFile] = File(..., description="3-10 imágenes, cada una max 5MB, image/*"),
    user: dict = Depends(require_arrendador),
):
    if len(files) < MIN_FILES:
        raise HTTPException(status_code=422, detail=f"Mínimo {MIN_FILES} fotos (HU-005 C2), recibidas {len(files)}")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=422, detail=f"Máximo {MAX_FILES} fotos, recibidas {len(files)}")

    urls = []
    for file in files:
        ext = _validate_file(file)
        content = await file.read()
        if len(content) > MAX_SIZE:
            raise HTTPException(status_code=413, detail=f"Archivo {file.filename} excede 5MB")
        if len(content) == 0:
            raise HTTPException(status_code=400, detail=f"Archivo {file.filename} vacío")

        # nombre seguro uuid
        filename = f"{uuid.uuid4().hex}{ext}"
        dest = os.path.join(UPLOAD_DIR, filename)
        # evita path traversal (ya usamos uuid, pero verificar)
        if not os.path.abspath(dest).startswith(UPLOAD_DIR):
            raise HTTPException(status_code=400, detail="Nombre de archivo inválido")

        with open(dest, "wb") as f:
            f.write(content)

        # URL absoluta basada en request base (funciona local y Render)
        base = str(request.base_url).rstrip("/")
        url = f"{base}/uploads/{filename}"
        urls.append(url)

    return {"urls": urls, "count": len(urls)}
