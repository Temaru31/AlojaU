"""Pipeline de moderación multimedia en subida de fotos (Fase 5, borrador).

Capas (baratas primero, caras después):
  1. magic-bytes + tamaño + dimensiones (Pillow): rechaza no-imágenes,
     gigantes o corruptas sin llamar a ningún servicio externo.
  2. Cloudinary Moderation Add-on (opcional, solo si hay credenciales):
    检测 de contenido no apto (AWS Rekognition / Google / manual).
  3. Heurística local "no relacionada": Hash perceptual / histograma para
     detectar duplicadas o placeholder (1x1, logo) -> REVISION_REQUERIDA.

Hoy está DESACTIVADO (ENABLE_MEDIA_MODERATION=false). El router de uploads
lo llamará cuando el flag se encienda; mientras tanto solo valida magic-bytes.
"""

from __future__ import annotations

from io import BytesIO

MAX_BYTES = 8 * 1024 * 1024
ALLOWED_MAGIC = {
    b"\xff\xd8\xff": "jpeg",
    b"\x89PNG\r\n\x1a\n": "png",
    b"RIFF": "webp?",  # se confirma por extensión/Pillow
    b"GIF87a": "gif",
    b"GIF89a": "gif",
}


def sniff_kind(data: bytes) -> str | None:
    """Detecta tipo por magic-bytes (no confía en la extensión)."""
    for magic, kind in ALLOWED_MAGIC.items():
        if data.startswith(magic):
            return kind
    return None


def validar_imagen_local(filename: str, data: bytes) -> dict:
    """Validación local sin red. Retorna {ok, motivo?, kind?, w?, h?}."""
    if not data:
        return {"ok": False, "motivo": "vacío"}
    if len(data) > MAX_BYTES:
        return {"ok": False, "motivo": "supera 8MB"}
    kind = sniff_kind(data)
    if not kind:
        return {"ok": False, "motivo": "no es imagen (magic-bytes)"}
    try:
        from PIL import Image

        im = Image.open(BytesIO(data))
        im.verify()
        im = Image.open(BytesIO(data))
        w, h = im.size
        if w < 200 or h < 200:
            return {"ok": True, "kind": kind, "w": w, "h": h, "flag": "REVISION_REQUERIDA", "motivo": "muy pequeña, posible placeholder"}
        return {"ok": True, "kind": kind, "w": w, "h": h}
    except Exception:
        # Sin Pillow o imagen corrupta: acepta por magic-bytes pero pide revisión.
        try:
            import PIL  # noqa: F401
        except Exception:
            return {"ok": True, "kind": kind, "flag": "REVISION_REQUERIDA", "motivo": "sin Pillow, revisión manual"}
        return {"ok": False, "motivo": "imagen corrupta"}


def moderar_con_cloudinary(url: str) -> dict:
    """Hook Cloudinary Moderation (no-op si no hay credenciales).

    Cuando CLOUDINARY_* esté configurado y el add-on activo, aquí se llamará
    a la API de moderación y se mapea: approved -> ok, rejected -> RECHAZADO,
    pending/manual -> REVISION_REQUERIDA. Hoy retorna pendiente para no bloquear.
    """
    from app.core.config import settings

    if not settings.cloudinary_configured:
        return {"estado": "PENDIENTE", "motivo": "moderación externa no configurada"}
    return {"estado": "PENDIENTE", "motivo": "add-on pendiente de activar en Cloudinary"}
