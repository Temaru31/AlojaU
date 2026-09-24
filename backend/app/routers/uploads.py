"""
routers/uploads.py - HU-005 Subida real fotos 3-10 + F3 Cloudinary
POST /api/publicaciones/upload -> {"urls": ["https://.../uploads/uuid.jpg", ...]}
Seguridad: solo ARRENDADOR, valida 3-10 archivos, 5MB c/u, image/*, nombre seguro uuid
Persistencia (Strategy via services/storage.py):
- Dev/test sin CLOUDINARY_*: disco local `backend/uploads/` (efímero en Render).
- Prod con CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET: Cloudinary `secure_url` persistente.
"""
import os
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request, Path
from pydantic import BaseModel

from app.core.security import get_current_user, require_arrendador
from app.services.storage import get_storage_backend
from app.db.session import get_session
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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

    # F3: Factory elige Local (dev) o Cloudinary (prod con CLOUDINARY_*).
    base = str(request.base_url).rstrip("/")
    backend = get_storage_backend(base_url=base)

    urls = []
    for file in files:
        ext = _validate_mime_ext(file)
        mime = (file.content_type or "").lower()

        # Lectura por chunks con tope 5MB (sin cargar de más en RAM) + magic check.
        # Se acumula en memoria (máx 5MB) para delegar al backend (disco o Cloudinary).
        size = 0
        chunks: list[bytes] = []
        first = True
        while True:
            chunk = await file.read(CHUNK_SIZE)
            if not chunk:
                break
            if first:
                _check_magic(mime, chunk)
                first = False
            size += len(chunk)
            if size > MAX_SIZE:
                raise HTTPException(status_code=413, detail=f"Archivo {file.filename} excede 5MB")
            chunks.append(chunk)
        if size == 0:
            raise HTTPException(status_code=400, detail=f"Archivo {file.filename} vacío")
        content = b"".join(chunks)

        # Nombre seguro uuid (evita path traversal y colisiones).
        filename = f"{uuid.uuid4().hex}{ext}"
        url = backend.save(content, filename, mime)
        urls.append(url)

    return {"urls": urls, "count": len(urls)}


@router.post("/una", response_model=UploadOut, summary="Dueño: subir 1 imagen (gestor multimedia)")
async def upload_una_foto(
    request: Request,
    file: UploadFile = File(..., description="1 imagen, max 5MB, image/*"),
    user: dict = Depends(require_arrendador),
):
    """v15.2 paso 1 del gestor: UNA foto (el /upload grupal exige 3-10).

    Misma validación (MIME+magic+5MB+uuid). Respuesta compatible UploadOut.
    """
    ext = _validate_mime_ext(file)
    mime = (file.content_type or "").lower()
    size = 0
    chunks: list[bytes] = []
    first = True
    while True:
        chunk = await file.read(CHUNK_SIZE)
        if not chunk:
            break
        if first:
            _check_magic(mime, chunk)
            first = False
        size += len(chunk)
        if size > MAX_SIZE:
            raise HTTPException(status_code=413, detail=f"Archivo {file.filename} excede 5MB")
        chunks.append(chunk)
    if size == 0:
        raise HTTPException(status_code=400, detail=f"Archivo {file.filename} vacío")
    base = str(request.base_url).rstrip("/")
    backend = get_storage_backend(base_url=base)
    filename = f"{uuid.uuid4().hex}{ext}"
    url = backend.save(b"".join(chunks), filename, mime)
    return {"urls": [url], "count": 1}


def _es_dueno_o_admin(user: dict | None, owner_id: int | None) -> bool:
    if not user:
        return False
    if user.get("rol") == "ADMIN":
        return True
    try:
        return int(user.get("id")) == int(owner_id) if owner_id is not None else False
    except Exception:
        return False


def _mock_enabled() -> bool:
    from app.core.config import settings as _s
    return bool(getattr(_s, "mock_enabled", False))


def _mock_ids_para(pub: dict) -> list[int]:
    """Ids virtuales estables para fotos mock (pub_id*1000 + índice)."""
    try:
        base = int(pub.get("id", 0)) * 1000
    except Exception:
        base = 0
    return [base + i for i, _ in enumerate(pub.get("fotos", []) or [], start=1)]


def _mock_buscar_por_foto(foto_id: int):
    """(pub, idx) mock que contiene el foto_id virtual, o (None, -1)."""
    try:
        from app.routers.publicaciones import MOCK_PUBS as _MP
    except Exception:
        return None, -1
    for pub in _MP:
        ids = _mock_ids_para(pub)
        if foto_id in ids:
            return pub, ids.index(foto_id)
    return None, -1


@router.delete("/{foto_id}", summary="Dueño: eliminar una foto del aviso")
async def eliminar_foto(
    foto_id: int = Path(..., ge=1),
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """v15.2 gestión multimedia. Solo dueño o ADMIN. Reordena `orden`
    contiguamente tras borrar (misma transacción). 401/403/404."""
    from app.models import ImagenPublicacion, Publicacion

    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    try:
        img = await db.get(ImagenPublicacion, foto_id)
        if not img:
            raise HTTPException(status_code=404, detail="Foto no encontrada")
        pub = await db.get(Publicacion, img.publicacion_id)
        if not pub or not _es_dueno_o_admin(user, pub.usuario_id):
            raise HTTPException(status_code=403, detail="Solo el dueño puede eliminar fotos")
        pid = img.publicacion_id
        await db.delete(img)
        await db.flush()
        # Compacta orden 1..N para que la portada siga siendo orden=1.
        restantes = (await db.execute(
            select(ImagenPublicacion).where(ImagenPublicacion.publicacion_id == pid)
            .order_by(ImagenPublicacion.orden.asc())
        )).scalars().all()
        for i, r in enumerate(restantes, start=1):
            r.orden = i
        await db.commit()
        # Borrado físico best-effort solo en disco local (Cloudinary: huérfana
        # aceptada; el destroy remoto vive en el panel de Cloudinary).
        try:
            from urllib.parse import urlparse as _up
            path = _up(img.url).path or ""
            if path.startswith("/uploads/"):
                local = os.path.join(UPLOAD_DIR, os.path.basename(path))
                if os.path.isfile(local):
                    os.remove(local)
        except Exception:
            pass
        return {"id": foto_id, "eliminada": True, "fotos_restantes": len(restantes)}
    except HTTPException:
        try:
            await db.rollback()
        except Exception:
            pass
        raise
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    # Mock dev sin PG: el gestor multimedia opera sobre MOCK_PUBS.fotos.
    # Id virtual = pub_id*1000 + posición (ver _mock_ids_para). Sin PG no hay
    # borrado físico: solo se reordena la lista (la portada sigue en [0]).
    if not _mock_enabled():
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    try:
        from app.routers.publicaciones import MOCK_PUBS as _MP
    except Exception:
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    pub, idx = _mock_buscar_por_foto(foto_id)
    if not pub:
        raise HTTPException(status_code=404, detail="Foto no encontrada")
    if not _es_dueno_o_admin(user, pub.get("usuario_id")):
        raise HTTPException(status_code=403, detail="Solo el dueño puede eliminar fotos")
    pub["fotos"].pop(idx)
    return {"id": foto_id, "eliminada": True, "fotos_restantes": len(pub["fotos"]), "mock": True}


class OrdenIn(BaseModel):
    publicacion_id: int
    orden_ids: list[int]


class VincularIn(BaseModel):
    publicacion_id: int
    urls: list[str]


@router.patch("/orden", summary="Dueño: reordenar fotos / cambiar portada")
async def reordenar_fotos(
    data: OrdenIn,
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """v15.2 portada = primer id de `orden_ids` (pasa a orden=1).

    Transacción explícita con orden temporal alto para no violar
    UNIQUE(publicacion_id, orden) a mitad de camino. 401/403/404/422.
    """
    from app.models import ImagenPublicacion, Publicacion

    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    if not data.orden_ids:
        raise HTTPException(status_code=422, detail="orden_ids vacío")
    try:
        pub = await db.get(Publicacion, data.publicacion_id)
        if not pub:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        if not _es_dueno_o_admin(user, pub.usuario_id):
            raise HTTPException(status_code=403, detail="Solo el dueño puede reordenar fotos")
        fotos = (await db.execute(
            select(ImagenPublicacion).where(
                ImagenPublicacion.publicacion_id == data.publicacion_id)
        )).scalars().all()
        por_id = {f.id: f for f in fotos}
        if set(data.orden_ids) != set(por_id.keys()):
            raise HTTPException(
                status_code=422,
                detail="orden_ids debe contener exactamente las fotos del aviso",
            )
        # Paso 1: orden temporal fuera de rango (evita colisión UNIQUE).
        for i, fid in enumerate(data.orden_ids):
            por_id[fid].orden = 1000 + i
        await db.flush()
        # Paso 2: orden final 1..N (portada = primero).
        for i, fid in enumerate(data.orden_ids, start=1):
            por_id[fid].orden = i
        await db.commit()
        return {"publicacion_id": data.publicacion_id, "orden": data.orden_ids,
                "portada_id": data.orden_ids[0]}
    except HTTPException:
        try:
            await db.rollback()
        except Exception:
            pass
        raise
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    # Mock dev sin PG: reordena MOCK_PUBS.fotos según orden_ids virtuales.
    if not _mock_enabled():
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    try:
        from app.routers.publicaciones import MOCK_PUBS as _MP
    except Exception:
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    pub = next((x for x in _MP if x.get("id") == data.publicacion_id), None)
    if not pub:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    if not _es_dueno_o_admin(user, pub.get("usuario_id")):
        raise HTTPException(status_code=403, detail="Solo el dueño puede reordenar fotos")
    esperados = _mock_ids_para(pub)
    if set(data.orden_ids) != set(esperados):
        raise HTTPException(
            status_code=422,
            detail="orden_ids debe contener exactamente las fotos del aviso",
        )
    por_url = {fid: url for fid, url in zip(esperados, list(pub["fotos"]))}
    pub["fotos"] = [por_url[fid] for fid in data.orden_ids]
    return {"publicacion_id": data.publicacion_id, "orden": data.orden_ids,
            "portada_id": data.orden_ids[0], "mock": True}


@router.post("/vincular", summary="Dueño: vincular URLs subidas como fotos del aviso")
async def vincular_fotos(
    data: VincularIn,
    db: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """v15.2 paso 2 del gestor multimedia: tras `POST /upload`, vincula las
    URLs como filas `ImagenPublicacion` (orden consecutivo, máx 10 en total).
    Solo dueño o ADMIN. 401/403/404/422."""
    from app.models import ImagenPublicacion, Publicacion

    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    urls = [str(u or "").strip()[:500] for u in (data.urls or []) if str(u or "").strip()]
    if not urls:
        raise HTTPException(status_code=422, detail="urls vacío")
    for u in urls:
        if not (u.startswith("https://") or u.startswith("http://")):
            raise HTTPException(status_code=422, detail="URLs deben ser http(s)")
    try:
        pub = await db.get(Publicacion, data.publicacion_id)
        if not pub:
            raise HTTPException(status_code=404, detail="Publicación no encontrada")
        if not _es_dueno_o_admin(user, pub.usuario_id):
            raise HTTPException(status_code=403, detail="Solo el dueño puede agregar fotos")
        actuales = (await db.execute(
            select(ImagenPublicacion).where(
                ImagenPublicacion.publicacion_id == data.publicacion_id)
        )).scalars().all()
        if len(actuales) + len(urls) > 10:
            raise HTTPException(status_code=422, detail="Máximo 10 fotos por aviso")
        base = max([r.orden for r in actuales], default=0)
        nuevas = []
        for i, url in enumerate(urls, start=1):
            row = ImagenPublicacion(publicacion_id=data.publicacion_id,
                                    url=url, orden=base + i)
            db.add(row)
            nuevas.append(row)
        await db.flush()
        ids = [r.id for r in nuevas]
        await db.commit()
        return {"publicacion_id": data.publicacion_id, "ids": ids,
                "total": len(actuales) + len(nuevas)}
    except HTTPException:
        try:
            await db.rollback()
        except Exception:
            pass
        raise
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    # Mock dev sin PG: anexa URLs a MOCK_PUBS.fotos (orden consecutivo).
    if not _mock_enabled():
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    try:
        from app.routers.publicaciones import MOCK_PUBS as _MP
    except Exception:
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    pub = next((x for x in _MP if x.get("id") == data.publicacion_id), None)
    if not pub:
        raise HTTPException(status_code=404, detail="Publicación no encontrada")
    if not _es_dueno_o_admin(user, pub.get("usuario_id")):
        raise HTTPException(status_code=403, detail="Solo el dueño puede agregar fotos")
    if len(pub.get("fotos", [])) + len(urls) > 10:
        raise HTTPException(status_code=422, detail="Máximo 10 fotos por aviso")
    pub["fotos"].extend(urls)
    nuevos = _mock_ids_para(pub)[-len(urls):]
    return {"publicacion_id": data.publicacion_id, "ids": nuevos,
            "total": len(pub["fotos"]), "mock": True}
