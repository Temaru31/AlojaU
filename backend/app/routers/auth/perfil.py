"""Perfil del usuario autenticado: datos, contraseña, verificación y avatar."""
import logging
from fastapi import APIRouter
import asyncio
from typing import Optional
from fastapi import File, HTTPException, Depends, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified
from app.core.security import get_current_user, id_propietario, ClaimsUsuario
from app.core.config import settings
from app.core.db_utils import rollback_seguro
from app.core.logseguro import exc_resumen
from app.core.rate_limit import registrar_intento, registrar_intento_persistente, verificar_intentos_fallidos
from app.db.session import get_session
from app.services.storage import borrar_local_si_huerfano
from app.core.normalizacion import normalizar_email
from app.routers.auth.comun import (
    _hash_password_async,
    _verify_password_async,
    normalizar_telefono,
    validar_foto_url,
    validar_preferencias,
)
from app.routers.auth.esquemas import PasswordChangeIn, PerfilOut, PerfilUpdateIn
from app.routers.auth.limites import _check_password_rate_limit

logger = logging.getLogger("alojau.auth")
router = APIRouter()

def _sanitizar_cambios_perfil(data: "PerfilUpdateIn") -> dict:
    """Normaliza/valida un PATCH de perfil una sola vez.

    Returns:
        Dict solo con claves enviadas (`model_fields_set`): `nombre`,
        `telefono` (dígitos E.164 o None para desvincular), `bio`,
        `foto` (https o None), `preferencias` (merge validado).

    Raises:
        HTTPException: 422 si teléfono/foto/preferencias son inválidos.
    """
    cambios: dict = {}
    if data.nombre_completo is not None:
        cambios["nombre"] = data.nombre_completo.strip()
    if "telefono_whatsapp" in data.model_fields_set:
        if not data.telefono_whatsapp:
            cambios["telefono"] = None
        else:
            tel = normalizar_telefono(data.telefono_whatsapp)
            if tel is None:
                raise HTTPException(
                    status_code=422,
                    detail="Teléfono inválido: usa 10 dígitos (ej. 3001234567)",
                )
            cambios["telefono"] = tel
    if data.bio is not None:
        cambios["bio"] = (data.bio.strip()[:500] or None)
    if "foto_perfil_url" in data.model_fields_set:
        cambios["foto"] = validar_foto_url(data.foto_perfil_url)
    if data.preferencias is not None:
        cambios["preferencias"] = validar_preferencias(data.preferencias)
    return cambios


def _perfil_out_db(u) -> "PerfilOut":
    """PerfilOut desde fila Usuario (incluye campos flexibles v13.2 + M5 telegram)."""
    return PerfilOut(
        id=u.id,
        email=u.email,
        nombre_completo=u.nombre_completo,
        telefono_whatsapp=u.telefono_whatsapp,
        telefono_verificado=bool(u.telefono_verificado),
        rol=u.rol,
        email_verificado=bool(getattr(u, "email_verificado", False)),
        auth_provider=getattr(u, "auth_provider", "password") or "password",
        bio=getattr(u, "bio", None),
        foto_perfil_url=getattr(u, "foto_perfil_url", None),
        preferencias=getattr(u, "preferencias", None) or {},
        telegram_vinculado=bool(getattr(u, "telegram_chat_id", None)),
    )


# Perfil (extiende contrato previo con email_verificado/auth_provider)
@router.get("/perfil", response_model=PerfilOut, summary="Obtener perfil del usuario autenticado")
async def get_perfil(
    user: ClaimsUsuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    email = user.get("sub")
    user_id = user.get("id")
    try:
        from app.models import Usuario
        u = None
        if user_id:
            u = await db.get(Usuario, user_id)
        elif email:
            res = await db.execute(select(Usuario).where(Usuario.email == normalizar_email(email)))
            u = res.scalars().first()
        if u:
            # La revocación JTI ya la aplica get_current_user (central).
            return _perfil_out_db(u)
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[auth get_perfil] DB falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.patch("/perfil/password", summary="Cambiar contraseña (requiere la actual)")
async def cambiar_password(
    data: PasswordChangeIn,
    user: ClaimsUsuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    import re as _re

    def _debil(pw: str) -> Optional[str]:
        if len(pw) < 8:
            return "La nueva contraseña debe tener al menos 8 caracteres"
        if not _re.search(r"[A-Za-z]", pw) or not _re.search(r"[0-9]", pw):
            return "La nueva contraseña debe incluir letras y números"
        return None

    email = user.get("sub")
    user_id = user.get("id")
    _check_password_rate_limit(f"{user_id or email}")
    err = _debil(data.nueva)
    if err:
        raise HTTPException(status_code=422, detail=err)
    if data.nueva == data.actual:
        raise HTTPException(status_code=422, detail="La nueva contraseña debe ser distinta de la actual")
    try:
        from app.models import Usuario
        u = None
        if user_id:
            u = await db.get(Usuario, user_id)
        elif email:
            res = await db.execute(select(Usuario).where(Usuario.email == normalizar_email(email)))
            u = res.scalars().first()
        if u:
            if not await _verify_password_async(data.actual, u.password_hash):
                raise HTTPException(status_code=403, detail="La contraseña actual no coincide")
            u.password_hash = await _hash_password_async(data.nueva)
            await db.commit()
            return {"mensaje": "Contraseña actualizada con éxito."}
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(db, "cambiar_password")
        logger.error(f"[auth password] DB falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.post("/perfil/solicitud-verificacion", status_code=202, summary="Solicitar verificación de teléfono")
async def solicitar_verificacion(
    user: ClaimsUsuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    return {"mensaje": "Solicitud registrada. Un administrador verificará tu línea.", "estado": "PENDIENTE"}


# Avatar dedicado (solo sesión autenticada, cualquier rol incl. ESTUDIANTE).
# PROHIBIDO reutilizar /upload/una (ese exige ARRENDADOR y daría 403 a
# estudiantes). Valida MIME imagen + 5MB, guarda vía storage y actualiza
# foto_perfil_url en la MISMA transacción.
# Throttle anti-abuso (memoria en dev + PG persistente en prod,
# mismo patrón que OTP) y limpieza de archivos huérfanos del disco local.
_AVATAR_MIME = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
_AVATAR_MAX = 5 * 1024 * 1024
_AVATAR_MEM: dict[str, list[float]] = {}
AVATAR_LIMIT = 10
AVATAR_WINDOW_S = 3600.0


@router.post("/avatar", summary="M3: subir avatar (cualquier rol autenticado, 5MB, imagen)")
async def subir_avatar(
    request: Request,
    file: UploadFile = File(..., description="Imagen de perfil, max 5MB, JPEG/PNG/WebP/GIF"),
    user: ClaimsUsuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """M3 endpoint dedicado (no reutiliza /upload/una que exige ARRENDADOR).

    Requiere solo sesión activa (ESTUDIANTE incluido). Valida MIME + 5MB y
    actualiza `foto_perfil_url` en la misma transacción.
    """
    return await _avatar_guardar(request, file, user, db)


# Firma mínima del contenido por MIME (misma política que uploads.py, sin Pillow).
_AVATAR_FIRMAS = {
    "image/jpeg": (lambda c: c.startswith(b"\xff\xd8\xff"), "Contenido no es JPEG válido"),
    "image/png": (lambda c: c.startswith(b"\x89PNG\r\n\x1a\n"), "Contenido no es PNG válido"),
    "image/gif": (lambda c: c.startswith((b"GIF87a", b"GIF89a")), "Contenido no es GIF válido"),
    "image/webp": (lambda c: c[:4] == b"RIFF" and c[8:12] == b"WEBP", "Contenido no es WebP válido"),
}


def _validar_formato_avatar(file) -> tuple[str, str]:
    """MIME permitido y extensión coherente con él; devuelve (mime, ext)."""
    import os as _os
    mime = (getattr(file, "content_type", "") or "").lower()
    if mime not in _AVATAR_MIME:
        raise HTTPException(status_code=400, detail="Solo imágenes JPEG/PNG/WebP/GIF (SVG bloqueado)")
    ext = _os.path.splitext(getattr(file, "filename", "") or "")[1].lower()
    if ext != _AVATAR_MIME[mime]:
        raise HTTPException(status_code=400, detail=f"Extensión {ext or '(sin extensión)'} no coincide con {mime}")
    return mime, ext


async def _leer_avatar(file, mime: str) -> bytes:
    """Lee por bloques: firma del primer bloque, tope de 5MB y rechazo de vacíos."""
    es_valido, error_firma = _AVATAR_FIRMAS[mime]
    size = 0
    chunks: list[bytes] = []
    while chunk := await file.read(1024 * 1024):
        if not chunks and not es_valido(chunk):
            raise HTTPException(status_code=400, detail=error_firma)
        size += len(chunk)
        if size > _AVATAR_MAX:
            raise HTTPException(status_code=413, detail="La imagen excede 5MB")
        chunks.append(chunk)
    if size == 0:
        raise HTTPException(status_code=400, detail="Archivo vacío")
    return b"".join(chunks)


async def _subir_avatar(request, content: bytes, ext: str, mime: str) -> str:
    """Guarda en el storage configurado (disco/Cloudinary) y devuelve la URL pública."""
    import uuid as _uuid
    try:
        from app.services.storage import get_storage_backend
        base = str(request.base_url).rstrip("/") if request is not None else ""
        backend = get_storage_backend(base_url=base or "http://localhost")
        # Disco local en prod = EFÍMERO (Render lo borra al redeploy). No se
        # rompe, pero se advierte: para avatares durables configura CLOUDINARY_*.
        if getattr(backend, "name", "") == "local" and getattr(settings, "ENV", "dev") == "prod":
            logger.warning("[avatar] prod con disco EFÍMERO (sin CLOUDINARY_*): el avatar se perderá al redeploy")
        filename = f"avatar-{_uuid.uuid4().hex}{ext}"
        # Subida fuera del event loop: puede tardar segundos.
        return await asyncio.to_thread(backend.save, content, filename, mime)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[avatar storage] falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="No se pudo guardar la imagen")


async def _persistir_avatar(db: AsyncSession, uid: int, url: str) -> dict:
    """Actualiza foto_perfil_url; si falla, borra el archivo recién subido (huérfano)."""
    try:
        from app.models import Usuario
        u = await db.get(Usuario, uid)
        if not u:
            borrar_local_si_huerfano(url)
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        anterior = u.foto_perfil_url
        u.foto_perfil_url = url[:500]
        await db.commit()
        await db.refresh(u)
        # Registra el intento (cuota) y borra el avatar previo si era
        # archivo local (el reemplazo lo deja huérfano).
        await registrar_intento_persistente(db, f"avatar:{uid}", False)
        if anterior and anterior != u.foto_perfil_url:
            borrar_local_si_huerfano(anterior)
        return {"foto_perfil_url": u.foto_perfil_url, "mensaje": "Foto de perfil actualizada."}
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(db, "_avatar_guardar")
        logger.error(f"[avatar db] falló: {exc_resumen(e)}", exc_info=True)
        borrar_local_si_huerfano(url)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


async def _avatar_guardar(request, file, user: ClaimsUsuario, db: AsyncSession) -> dict:
    uid = id_propietario(user)
    mime, ext = _validar_formato_avatar(file)
    # Throttle tras validar forma (los 400 no queman cuota ni
    # disco) y antes de leer bytes/guardar. 10/hora por usuario.
    registrar_intento(_AVATAR_MEM, f"avatar:{uid}", AVATAR_LIMIT, AVATAR_WINDOW_S,
                      "Demasiadas subidas de avatar, espera 1 hora")
    await verificar_intentos_fallidos(db, f"avatar:{uid}", limite=AVATAR_LIMIT, ventana_s=int(AVATAR_WINDOW_S))
    content = await _leer_avatar(file, mime)
    url = await _subir_avatar(request, content, ext, mime)
    return await _persistir_avatar(db, uid, url)


@router.delete("/avatar", summary="M3: quitar foto (muestra iniciales)")
async def quitar_avatar(
    user: ClaimsUsuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Setea foto_perfil_url=null (el frontend muestra iniciales).

    Bloque 1: también borra el archivo local anterior (quitar dejaba el
    archivo huérfano ocupando disco para siempre).
    """
    uid = id_propietario(user)
    try:
        from app.models import Usuario
        u = await db.get(Usuario, uid)
        if u:
            anterior = u.foto_perfil_url
            u.foto_perfil_url = None
            await db.commit()
            borrar_local_si_huerfano(anterior)
            return {"foto_perfil_url": None, "mensaje": "Foto eliminada."}
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(db, "quitar_avatar")
        logger.error(f"[avatar quitar] falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@router.patch("/perfil", response_model=PerfilOut, summary="Actualizar nombre y teléfono (verificación solo-lectura)")
async def update_perfil(
    data: PerfilUpdateIn,
    user: ClaimsUsuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    email = user.get("sub")
    user_id = user.get("id")
    try:
        from app.models import Usuario
        u = None
        if user_id:
            u = await db.get(Usuario, user_id)
        elif email:
            res = await db.execute(select(Usuario).where(Usuario.email == normalizar_email(email)))
            u = res.scalars().first()
        if u:
            cambios = _sanitizar_cambios_perfil(data)
            if "nombre" in cambios:
                u.nombre_completo = cambios["nombre"]
            # None desvincula (y pierde verificación); cambio real
            # de número también pierde verificación (re-verificar por admin).
            if "telefono" in cambios:
                if (cambios["telefono"] or "") != (u.telefono_whatsapp or ""):
                    u.telefono_whatsapp = cambios["telefono"]
                    u.telefono_verificado = False
            if "bio" in cambios:
                u.bio = cambios["bio"]
            if "foto" in cambios:
                u.foto_perfil_url = cambios["foto"]
            if "preferencias" in cambios:
                actual = getattr(u, "preferencias", None) or {}
                if not isinstance(actual, dict):
                    actual = {}
                actual.update(cambios["preferencias"])
                u.preferencias = dict(actual)
                flag_modified(u, "preferencias")
            await db.commit()
            await db.refresh(u)
            return _perfil_out_db(u)
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(db, "update_perfil")
        logger.error(f"[auth update_perfil] DB falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
