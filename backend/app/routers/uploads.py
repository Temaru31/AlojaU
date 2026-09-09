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
from pydantic import BaseModel

from app.core.security import require_arrendador

router = APIRouter(prefix="/api/publicaciones/upload", tags=["uploads"])

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "../../uploads")
UPLOAD_DIR = os.path.abspath(UPLOAD_DIR)
MAX_FILES = 10
MIN_FILES = 3
MAX_SIZE = 5 * 1024 * 1024  # 5MB
CHUNK_SIZE = 1024 * 1024  # 1MB por chunk (no carga el archivo en RAM)
# Lista blanca estricta MIME -> extensiones (SVG bloqueado: ejecuta scripts).
ALLOWED_MIME = {
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
    "image/webp": {".webp"},
    "image/gif": {".gif"},
}
# Firmas mágicas por tipo (verificación sin Pillow).
MAGIC = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),  # + "WEBP" en bytes 8:12
    "image/gif": (b"GIF87a", b"GIF89a"),
}

os.makedirs(UPLOAD_DIR, exist_ok=True)

def _validate_mime_ext(file: UploadFile):
    # MIME exacto en lista blanca (sin startswith("image/"): colaba SVG).
    mime = (file.content_type or "").lower()
    if mime not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail=f"Archivo {file.filename} no permitido (solo JPEG/PNG/WebP/GIF, SVG bloqueado)")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_MIME[mime]:
        raise HTTPException(status_code=400, detail=f"Extensión {ext or '(sin extensión)'} no coincide con {mime}")
    return ext


def _check_magic(mime: str, head: bytes):
    sigs = MAGIC[mime]
    if mime == "image/webp":
        if not (head[:4] == b"RIFF" and head[8:12] == b"WEBP"):
            raise HTTPException(status_code=400, detail="Contenido no es WebP válido")
        return
    if not any(head.startswith(s) for s in sigs):
        raise HTTPException(status_code=400, detail="Contenido no coincide con el tipo declarado")

class UploadOut(BaseModel):
    urls: List[str]
    count: int


@router.post("", response_model=UploadOut, summary="HU-005 Upload 3-10 imágenes (solo ARRENDADOR)")
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
        ext = _validate_mime_ext(file)

        # nombre seguro uuid
        filename = f"{uuid.uuid4().hex}{ext}"
        dest = os.path.join(UPLOAD_DIR, filename)
        # evita path traversal (ya usamos uuid, pero verificar)
        if not os.path.abspath(dest).startswith(UPLOAD_DIR):
            raise HTTPException(status_code=400, detail="Nombre de archivo inválido")

        # Escritura por chunks con tope 5MB (sin cargar todo en RAM) + magic check.
        size = 0
        first = True
        with open(dest, "wb") as f:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                if first:
                    _check_magic((file.content_type or "").lower(), chunk)
                    first = False
                size += len(chunk)
                if size > MAX_SIZE:
                    break
                f.write(chunk)
            if size > MAX_SIZE:
                os.remove(dest)
                raise HTTPException(status_code=413, detail=f"Archivo {file.filename} excede 5MB")
        if size == 0:
            os.remove(dest)
            raise HTTPException(status_code=400, detail=f"Archivo {file.filename} vacío")

        # URL absoluta basada en request base (funciona local y Render)
        base = str(request.base_url).rstrip("/")
        url = f"{base}/uploads/{filename}"
        urls.append(url)

    return {"urls": urls, "count": len(urls)}
