"""Perfil del usuario autenticado: datos, contraseña, verificación y avatar."""
import logging
from fastapi import APIRouter
import asyncio
from typing import Optional
from fastapi import File, HTTPException, Depends, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified
from app.core.security import get_current_user
from app.core.config import settings
from app.core.db_utils import rollback_seguro
from app.core.logseguro import exc_resumen
from app.core.rate_limit import registrar_intento, registrar_intento_persistente, verificar_intentos_fallidos
from app.db.session import get_session
from app.services.storage import borrar_local_si_huerfano
from app.core.flags import mock_enabled
from app.core.dominio import Rol
from app.fixtures.publicaciones_demo import MOCK_PUBS
from app.fixtures.usuarios_demo import MOCK_USERS
from app.core.normalizacion import normalizar_email
from app.routers.auth.comun import _hash_password_async, _verify_password_async, normalizar_telefono, validar_foto_url, validar_preferencias
from app.routers.auth.esquemas import PasswordChangeIn, PerfilOut, PerfilUpdateIn
from app.routers.auth.limites import _check_password_rate_limit

logger = logging.getLogger("alojau.auth")
router = APIRouter()

def _sanitizar_cambios_perfil(data: "PerfilUpdateIn") -> dict:
    """Normaliza/valida un PATCH de perfil una sola vez (DB y mock la usan).

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


def _perfil_out_mock(m: dict, email, user_id, user: dict | None = None) -> "PerfilOut":
    """PerfilOut desde MOCK_USERS (incluye campos flexibles v13.2 + M5 telegram)."""
    user = user or {}
    return PerfilOut(
        id=m.get("id", user_id or 1),
        email=email,
        nombre_completo=m.get("nombre_completo", "Arrendador Demo"),
        telefono_whatsapp=m.get("telefono_whatsapp"),
        telefono_verificado=bool(m.get("telefono_verificado", False)),
        rol=m.get("rol", Rol.ARRENDADOR),
        email_verificado=bool(m.get("email_verificado", True)),
        auth_provider=m.get("auth_provider", "password"),
        bio=m.get("bio"),
        foto_perfil_url=m.get("foto_perfil_url"),
        preferencias=m.get("preferencias") or {},
        telegram_vinculado=bool(m.get("telegram_chat_id")),
    )


# ---------------------------------------------------------------------------
# Perfil (extiende contrato previo con email_verificado/auth_provider)
# ---------------------------------------------------------------------------
@router.get("/perfil", response_model=PerfilOut, summary="Obtener perfil del usuario autenticado")
async def get_perfil(
    user: dict = Depends(get_current_user),
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
        if not mock_enabled():
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[auth get_perfil] DB falló: {exc_resumen(e)}", exc_info=True)
        if not mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")

    m = MOCK_USERS.get(email) or MOCK_USERS.get(normalizar_email(email or ""))
    if not m:
        for em, udata in MOCK_USERS.items():
            if udata.get("id") == user_id:
                m = udata
                email = em
                break
    if not m:
        return PerfilOut(
            id=user_id or 1,
            email=email or "arrendador@alojau.com",
            nombre_completo="Arrendador Demo",
            telefono_whatsapp="573001234567",
            telefono_verificado=bool(user.get("telefono_verificado", False)),
            rol=user.get("rol", Rol.ARRENDADOR),
            email_verificado=bool(user.get("email_verificado", False)),
            auth_provider="password",
        )
    return _perfil_out_mock(m, email, user_id, user)


@router.patch("/perfil/password", summary="Cambiar contraseña (requiere la actual)")
async def cambiar_password(
    data: PasswordChangeIn,
    user: dict = Depends(get_current_user),
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
        if not mock_enabled():
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(db, "cambiar_password")
        logger.error(f"[auth password] DB falló: {exc_resumen(e)}", exc_info=True)
        if not mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")

    m = MOCK_USERS.get(email)
    if not m:
        for em, udata in MOCK_USERS.items():
            if udata.get("id") == user_id:
                m = udata
                email = em
                break
    if not m:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if not await _verify_password_async(data.actual, m["password"]):
        raise HTTPException(status_code=403, detail="La contraseña actual no coincide")
    m["password"] = await _hash_password_async(data.nueva)
    return {"mensaje": "Contraseña actualizada con éxito."}


@router.post("/perfil/solicitud-verificacion", status_code=202, summary="Solicitar verificación de teléfono")
async def solicitar_verificacion(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    return {"mensaje": "Solicitud registrada. Un administrador verificará tu línea.", "estado": "PENDIENTE"}


# ---------------------------------------------------------------------------
# Avatar dedicado (solo sesión autenticada, cualquier rol incl. ESTUDIANTE).
# PROHIBIDO reutilizar /upload/una (ese exige ARRENDADOR y daría 403 a
# estudiantes). Valida MIME imagen + 5MB, guarda vía storage y actualiza
# foto_perfil_url en la MISMA transacción.
# Throttle anti-abuso (memoria en dev + PG persistente en prod,
# mismo patrón que OTP) y limpieza de archivos huérfanos del disco local.
# ---------------------------------------------------------------------------
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
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """M3 endpoint dedicado (no reutiliza /upload/una que exige ARRENDADOR).

    Requiere solo sesión activa (ESTUDIANTE incluido). Valida MIME + 5MB y
    actualiza `foto_perfil_url` en la misma transacción.
    """
    return await _avatar_guardar(request, file, user, db)


async def _avatar_guardar(
    request,
    file,
    user: dict,
    db: AsyncSession,
) -> dict:
    import os as _os
    import uuid as _uuid
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    mime = (getattr(file, "content_type", "") or "").lower()
    if mime not in _AVATAR_MIME:
        raise HTTPException(status_code=400, detail="Solo imágenes JPEG/PNG/WebP/GIF (SVG bloqueado)")
    ext = _os.path.splitext(getattr(file, "filename", "") or "")[1].lower()
    if ext != _AVATAR_MIME[mime]:
        raise HTTPException(status_code=400, detail=f"Extensión {ext or '(sin extensión)'} no coincide con {mime}")
    # Throttle tras validar forma (los 400 no queman cuota ni
    # disco) y antes de leer bytes/guardar. 10/hora por usuario.
    registrar_intento(_AVATAR_MEM, f"avatar:{uid}", AVATAR_LIMIT, AVATAR_WINDOW_S,
                   "Demasiadas subidas de avatar, espera 1 hora")
    await verificar_intentos_fallidos(db, f"avatar:{uid}", limite=AVATAR_LIMIT, ventana_s=int(AVATAR_WINDOW_S))
    size = 0
    chunks: list[bytes] = []
    first = True
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        if first:
            # Magic check mínimo (misma política que uploads.py, sin Pillow).
            if mime == "image/jpeg" and not chunk.startswith(b"\xff\xd8\xff"):
                raise HTTPException(status_code=400, detail="Contenido no es JPEG válido")
            if mime == "image/png" and not chunk.startswith(b"\x89PNG\r\n\x1a\n"):
                raise HTTPException(status_code=400, detail="Contenido no es PNG válido")
            if mime == "image/gif" and not (chunk.startswith(b"GIF87a") or chunk.startswith(b"GIF89a")):
                raise HTTPException(status_code=400, detail="Contenido no es GIF válido")
            if mime == "image/webp" and not (chunk[:4] == b"RIFF" and chunk[8:12] == b"WEBP"):
                raise HTTPException(status_code=400, detail="Contenido no es WebP válido")
            first = False
        size += len(chunk)
        if size > _AVATAR_MAX:
            raise HTTPException(status_code=413, detail="La imagen excede 5MB")
        chunks.append(chunk)
    if size == 0:
        raise HTTPException(status_code=400, detail="Archivo vacío")
    content = b"".join(chunks)
    try:
        from app.services.storage import get_storage_backend, es_persistente
        base = str(request.base_url).rstrip("/") if request is not None else ""
        backend = get_storage_backend(base_url=base or "http://localhost")
        # Disco local en prod = EFÍMERO (Render lo borra al redeploy). No se
        # rompe, pero se advierte: para avatares durables configura CLOUDINARY_*.
        if getattr(backend, "name", "") == "local" and getattr(settings, "ENV", "dev") == "prod":
            logger.warning("[avatar] prod con disco EFÍMERO (sin CLOUDINARY_*): el avatar se perderá al redeploy")
        filename = f"avatar-{_uuid.uuid4().hex}{ext}"
        # Subida (disco/Cloudinary) fuera del event loop: puede tardar segundos.
        url = await asyncio.to_thread(backend.save, content, filename, mime)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[avatar storage] falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="No se pudo guardar la imagen")
    # Misma transacción: actualiza foto_perfil_url en BD.
    try:
        from app.models import Usuario
        u = await db.get(Usuario, uid)
        if not u:
            if not mock_enabled():
                # Sin usuario no hay dueño para el archivo recién guardado:
                # se borra para no dejar huérfanos en disco.
                borrar_local_si_huerfano(url)
                raise HTTPException(status_code=404, detail="Usuario no encontrado")
        else:
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
        if not mock_enabled():
            # El archivo ya se guardó pero la BD falló: quedaría huérfano.
            borrar_local_si_huerfano(url)
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    # Mock dev: actualiza MOCK_USERS.
    for _em, _m in MOCK_USERS.items():
        if _m.get("id") == uid:
            anterior = _m.get("foto_perfil_url")
            _m["foto_perfil_url"] = url[:500]
            if anterior and anterior != url[:500]:
                borrar_local_si_huerfano(anterior)
            break
    return {"foto_perfil_url": url[:500], "mensaje": "Foto de perfil actualizada (mock).", "mock": True}


@router.delete("/avatar", summary="M3: quitar foto (muestra iniciales)")
async def quitar_avatar(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Setea foto_perfil_url=null (el frontend muestra iniciales).

    Bloque 1: también borra el archivo local anterior (quitar dejaba el
    archivo huérfano ocupando disco para siempre).
    """
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    try:
        from app.models import Usuario
        u = await db.get(Usuario, uid)
        if u:
            anterior = u.foto_perfil_url
            u.foto_perfil_url = None
            await db.commit()
            borrar_local_si_huerfano(anterior)
            return {"foto_perfil_url": None, "mensaje": "Foto eliminada."}
        if not mock_enabled():
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(db, "quitar_avatar")
        logger.error(f"[avatar quitar] falló: {exc_resumen(e)}", exc_info=True)
        if not mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
    for _em, _m in MOCK_USERS.items():
        if _m.get("id") == uid:
            anterior = _m.get("foto_perfil_url")
            _m["foto_perfil_url"] = None
            borrar_local_si_huerfano(anterior)
            break
    return {"foto_perfil_url": None, "mensaje": "Foto eliminada (mock).", "mock": True}


@router.patch("/perfil", response_model=PerfilOut, summary="Actualizar nombre y teléfono (verificación solo-lectura)")
async def update_perfil(
    data: PerfilUpdateIn,
    user: dict = Depends(get_current_user),
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
        if not mock_enabled():
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(db, "update_perfil")
        logger.error(f"[auth update_perfil] DB falló: {exc_resumen(e)}", exc_info=True)
        if not mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")

    m = MOCK_USERS.get(email)
    if not m:
        for em, udata in MOCK_USERS.items():
            if udata.get("id") == user_id:
                m = udata
                email = em
                break
    if not m:
        m = {
            "password": await _hash_password_async("AlojaU123"),
            "rol": user.get("rol", Rol.ARRENDADOR),
            "id": user_id or 1,
            "nombre_completo": "Arrendador Demo",
            "telefono_whatsapp": "573001234567",
            "telefono_verificado": False,
            "email_verificado": False,
        }
        MOCK_USERS[email or "arrendador@alojau.com"] = m

    if data.nombre_completo is not None:
        m["nombre_completo"] = data.nombre_completo
    # Espejo del comportamiento DB en mocks (vía sanitizador común).
    cambios = _sanitizar_cambios_perfil(data)
    if "telefono" in cambios:
        if (cambios["telefono"] or "") != (m.get("telefono_whatsapp") or ""):
            m["telefono_whatsapp"] = cambios["telefono"]
            m["telefono_verificado"] = False
    if "bio" in cambios:
        m["bio"] = cambios["bio"]
    if "foto" in cambios:
        m["foto_perfil_url"] = cambios["foto"]
    if "preferencias" in cambios:
        actual = m.get("preferencias") or {}
        if not isinstance(actual, dict):
            actual = {}
        actual.update(cambios["preferencias"])
        m["preferencias"] = dict(actual)

    for pub in MOCK_PUBS:
        if pub.get("usuario_id") == m.get("id"):
            if "telefono_whatsapp" in data.model_fields_set:
                pub["telefono_whatsapp"] = m.get("telefono_whatsapp")

    return _perfil_out_mock(m, email, user_id, user)
