"""F3 storage - Strategy para persistencia de fotos (local dev vs Cloudinary prod).

Patrón Strategy + Factory + DI:
- `StorageBackend` (ABC): contrato `save(content, filename, mime) -> url`.
- `LocalStorageBackend`: guarda en `backend/uploads/` y retorna `{base}/uploads/{file}`.
  Efímero en Render Free (se borra al redeploy) — solo dev/test.
- `CloudinaryStorageBackend`: sube a Cloudinary (`secure_url` persistente).
  Requiere `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` + lib `cloudinary`.
- `get_storage_backend(base_url)` (Factory): elige según `settings.cloudinary_configured`.

Uso: `routers/uploads.py` valida (MIME/ext/magic/5MB) y delega el guardado aquí.
Ej: `backend = get_storage_backend("http://localhost:8000"); url = backend.save(b"...", "a.jpg", "image/jpeg").

Buenas prácticas:
- Import de `cloudinary` LAZY (dentro del método) para no romper dev sin la lib.
- Nombres uuid fuera (el router los genera); aquí solo persiste.
- Sin secretos en código: todo vía `settings` (.env).
"""
import os
from abc import ABC, abstractmethod

from app.core.config import settings


class StorageBackend(ABC):
    """Contrato de almacenamiento (Strategy)."""

    name: str = "base"

    @abstractmethod
    def save(self, content: bytes, filename: str, mime: str) -> str:
        """Persiste `content` y retorna URL pública. Lanza HTTPException en fallo."""
        raise NotImplementedError


class LocalStorageBackend(StorageBackend):
    """Dev/test: disco local + URL `{base}/uploads/{filename}`."""

    name = "local"

    def __init__(self, upload_dir: str, base_url: str):
        self.upload_dir = os.path.abspath(upload_dir)
        self.base_url = base_url.rstrip("/")
        os.makedirs(self.upload_dir, exist_ok=True)

    def save(self, content: bytes, filename: str, mime: str) -> str:
        # Defensa path traversal aunque el router ya usa uuid.
        dest = os.path.abspath(os.path.join(self.upload_dir, filename))
        if not dest.startswith(self.upload_dir):
            from fastapi import HTTPException

            raise HTTPException(status_code=400, detail="Nombre de archivo inválido")
        with open(dest, "wb") as f:
            f.write(content)
        return f"{self.base_url}/uploads/{filename}"


class CloudinaryStorageBackend(StorageBackend):
    """Prod: Cloudinary con `secure_url` (persistente, CDN).

    Requiere lib `cloudinary==1.40.0` (`pip install cloudinary`).
    """

    name = "cloudinary"

    def __init__(self, cloud_name: str = "", api_key: str = "", api_secret: str = "", folder: str = "alojau"):
        self.cloud_name = cloud_name or settings.CLOUDINARY_CLOUD_NAME
        self.api_key = api_key or settings.CLOUDINARY_API_KEY
        self.api_secret = api_secret or settings.CLOUDINARY_API_SECRET
        self.folder = folder or settings.CLOUDINARY_FOLDER

    def save(self, content: bytes, filename: str, mime: str) -> str:
        try:
            import cloudinary
            import cloudinary.uploader
        except ImportError as e:
            from fastapi import HTTPException

            raise HTTPException(
                status_code=503,
                detail="Cloudinary configurado pero lib 'cloudinary' no instalada (pip install cloudinary)",
            ) from e
        if not (self.cloud_name and self.api_key and self.api_secret):
            from fastapi import HTTPException

            raise HTTPException(status_code=503, detail="Cloudinary sin credenciales (CLOUDINARY_*)")
        cloudinary.config(
            cloud_name=self.cloud_name,
            api_key=self.api_key,
            api_secret=self.api_secret,
            secure=True,
        )
        # public_id sin extensión (Cloudinary la infiere); resource_type image bloquea SVG/video.
        public_id = os.path.splitext(filename)[0]
        try:
            result = cloudinary.uploader.upload(
                content,
                folder=self.folder,
                public_id=public_id,
                resource_type="image",
                overwrite=False,
            )
        except Exception as e:
            from fastapi import HTTPException

            raise HTTPException(status_code=502, detail=f"Cloudinary falló: {type(e).__name__}") from e
        url = result.get("secure_url") or result.get("url") or ""
        if not url:
            from fastapi import HTTPException

            raise HTTPException(status_code=502, detail="Cloudinary sin secure_url")
        return url


def get_storage_backend(base_url: str = "", upload_dir: str = "") -> StorageBackend:
    """Factory: Cloudinary si `settings.cloudinary_configured`, si no Local.

    Args:
        base_url: base para URLs locales (ej `str(request.base_url)`).
        upload_dir: override solo tests (default `backend/uploads/`).
    """
    if settings.cloudinary_configured:
        return CloudinaryStorageBackend()
    default_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../uploads")
    )
    return LocalStorageBackend(upload_dir=upload_dir or default_dir, base_url=base_url or "http://localhost:8000")
