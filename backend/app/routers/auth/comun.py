"""Utilidades compartidas por los endpoints de auth: hashing, normalización, tokens y cuentas."""
import logging
import asyncio
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import hash_password, verify_password, create_token
from app.core.config import settings
from app.core.db_utils import rollback_seguro
from app.core.logseguro import exc_resumen
from app.core.net import client_ip
from app.core.dominio import DIAS_GRACIA_CUENTA

logger = logging.getLogger("alojau.auth")

async def _hash_password_async(pw: str) -> str:
    """bcrypt fuera del event loop (CPU-bound ~100-300ms por hash).

    Sin esto, cada login/registro bloquea el loop asyncio y serializa
    todos los requests concurrentes del worker (autosaturación).
    """
    return await asyncio.to_thread(hash_password, pw)


async def _verify_password_async(pw: str, h: str) -> bool:
    """Verificación bcrypt fuera del event loop (ver _hash_password_async)."""
    return await asyncio.to_thread(verify_password, pw, h)


# ---------------------------------------------------------------------------
# Marketplace: normalización y validación de perfil flexible.
# ---------------------------------------------------------------------------
def normalizar_telefono(raw: str | None) -> str | None:
    """E.164 en dígitos sin '+' (canónico AlojaU, compatible wa.me y CHECK).

    - ''/None -> None (sin vincular; publicar lo exigirá con 400).
    - 10 dígitos -> prefijo 57 (Colombia); con 57 al inicio se conserva.
    - Retorna None si no quedan 7-15 dígitos (el caller responde 422).
    Desvío documentado de E.164 estricto ('+'): el '+' rompería los enlaces
    https://wa.me/ existentes y cambiaría todas las respuestas API.
    """
    if raw is None:
        return None
    d = re.sub(r"\D", "", str(raw))
    if not d:
        return None
    if len(d) == 10:
        d = "57" + d
    if not (7 <= len(d) <= 15):
        return None
    return d


def digitos_nacionales(raw: str | None) -> str | None:
    """Últimos 10 dígitos para COMPARAR (no para guardar).

    El canónico de BD sigue siendo E.164 de `normalizar_telefono` (wa.me,
    CHECKs, migración 009): cambiarlo rompería enlaces y respuestas API.
    Para verificar se comparan los últimos 10 dígitos, tolerando "con/sin
    código país" y el formato crudo que devuelve Telegram (tdlib advierte
    que `contact.phone_number` puede llegar sin normalizar).
    Retorna None si hay menos de 10 dígitos (no verificable por este medio).
    """
    d = re.sub(r"\D", "", str(raw or ""))
    if len(d) < 10:
        return None
    return d[-10:]


PREFIJOS_PREFERENCIAS = ("filtros.", "roomie.", "notis.")
MAX_PREFERENCIAS_BYTES = 4096
MAX_PREFERENCIAS_CLAVES = 30
MAX_PREFERENCIAS_PROFUNDIDAD = 3


def _profundidad(obj, nivel=1) -> int:
    if isinstance(obj, dict) and obj:
        return max(_profundidad(v, nivel + 1) for v in obj.values())
    if isinstance(obj, list) and obj:
        return max(_profundidad(v, nivel + 1) for v in obj)
    return nivel


def validar_preferencias(prefs) -> dict:
    """Sanea preferencias JSONB: namespaces, tamaño ~4KB, tipos planos.

    Lanza HTTPException 422 si viola el contrato. Nunca decide AuthZ.
    """
    import json as _json
    if prefs is None:
        return {}
    if not isinstance(prefs, dict):
        raise HTTPException(status_code=422, detail="preferencias debe ser un objeto JSON")
    if len(prefs) > MAX_PREFERENCIAS_CLAVES:
        raise HTTPException(status_code=422, detail="Demasiadas preferencias (máx 30)")
    for k, v in prefs.items():
        if not isinstance(k, str) or not k.startswith(PREFIJOS_PREFERENCIAS):
            raise HTTPException(
                status_code=422,
                detail=f"Preferencia no permitida: '{k}' (usa filtros.* roomie.* notis.*)",
            )
        # Listas planas (punto 3 del PDF: rasgos positivos/negativos).
        if isinstance(v, (list, tuple)):
            if len(v) > 20:
                raise HTTPException(status_code=422, detail=f"Lista muy larga en '{k}' (máx 20)")
            for item in v:
                if not isinstance(item, (bool, int, float, str, type(None))):
                    raise HTTPException(status_code=422, detail=f"Valor no permitido en '{k}'")
                if isinstance(item, str) and len(item) > 200:
                    raise HTTPException(status_code=422, detail=f"Valor muy largo en '{k}' (máx 200)")
            continue
        if not isinstance(v, (bool, int, float, str, type(None))):
            raise HTTPException(status_code=422, detail=f"Valor no permitido en '{k}'")
        if isinstance(v, str) and len(v) > 200:
            raise HTTPException(status_code=422, detail=f"Valor muy largo en '{k}' (máx 200)")
    if _profundidad(prefs) > MAX_PREFERENCIAS_PROFUNDIDAD:
        raise HTTPException(status_code=422, detail="Preferencias demasiado anidadas")
    try:
        if len(_json.dumps(prefs, ensure_ascii=False).encode("utf-8")) > MAX_PREFERENCIAS_BYTES:
            raise HTTPException(status_code=422, detail="Preferencias exceden 4 KB")
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Preferencias no serializables")
    return dict(prefs)


def validar_foto_url(url: str | None) -> str | None:
    """Avatar: None/'' -> None; exige https:// estricto (anti-XSS en <img src>)."""
    if not url:
        return None
    u = str(url).strip()[:500]
    if not u.lower().startswith("https://"):
        raise HTTPException(status_code=422, detail="La foto debe ser una URL https://")
    return u


def _password_fuerte_v13(pw: str) -> Optional[str]:
    """Fortaleza v13 para recovery/registro: 8+ con mayús, número y especial."""
    if len(pw) < 8:
        return "Mínimo 8 caracteres"
    if not re.search(r"[A-Z]", pw):
        return "Debe incluir al menos una mayúscula"
    if not re.search(r"[0-9]", pw):
        return "Debe incluir al menos un número"
    if not re.search(r"[^A-Za-z0-9]", pw):
        return "Debe incluir al menos un carácter especial"
    return None


def _issue_token(usuario_id: int, email: str, rol: str,
                 telefono_verificado: bool = False,
                 email_verificado: bool = False,
                 jti: str | None = None) -> str:
    from app.core.permissions import scopes_for_role
    claims = {
        "sub": email,
        "rol": rol,
        "id": usuario_id,
        "telefono_verificado": bool(telefono_verificado),
        "email_verificado": bool(email_verificado),
        "scopes": sorted(scopes_for_role(rol)),
    }
    if jti:
        claims["jti"] = jti
    return create_token(claims)


async def _registrar_sesion(db: AsyncSession, usuario_id: int, jti: str,
                            request: Request | None) -> None:
    """Guarda la sesión para revocación global.

    Best-effort: si falla, el login continúa (el token sigue siendo válido por
    firma y expiración) pero queda registrado que no podrá revocarse por jti.
    """
    from app.models import Sesion
    user_agent = (request.headers.get("user-agent", "")[:255] or None) if request else None
    try:
        db.add(Sesion(
            usuario_id=usuario_id, jti=jti,
            ip=client_ip(request), user_agent=user_agent,
        ))
        await db.commit()
    except Exception as e:
        logger.warning("[sesiones] no se pudo registrar la sesión uid=%s: %s",
                       usuario_id, exc_resumen(e))
        await rollback_seguro(db, "_registrar_sesion")


async def _emitir_token_con_sesion(db: AsyncSession, usuario, request: Request,
                                   email_verificado: bool) -> str:
    """Emite el JWT de un usuario persistido y registra su sesión revocable."""
    jti = uuid.uuid4().hex
    token = _issue_token(usuario.id, usuario.email, usuario.rol,
                         bool(usuario.telefono_verificado), email_verificado, jti=jti)
    await _registrar_sesion(db, usuario.id, jti, request)
    return token


# ---------------------------------------------------------------------------
# Soft-delete de cuentas (gracia 30 días + purga física + restore).
# ---------------------------------------------------------------------------


def _gracia_restante(u) -> int | None:
    """Días restantes de gracia, None si la cuenta está activa."""
    elim = getattr(u, "eliminado_en", None)
    if elim is None:
        return None
    if getattr(elim, "tzinfo", None) is None:
        elim = elim.replace(tzinfo=timezone.utc)
    fin = elim + timedelta(days=DIAS_GRACIA_CUENTA)
    restan = (fin - datetime.now(timezone.utc)).days
    return restan


async def _intentar_purgar_usuario(db: AsyncSession, u) -> None:
    """Borrado físico: cascadas (publicaciones, sesiones) + SET NULL (reportes).

    Best-effort: si falla se registra y la transacción queda limpia; la cuenta
    vencida se volverá a purgar en el próximo intento de login/registro.
    """
    try:
        await db.delete(u)
        await db.commit()
    except Exception as e:
        logger.warning("[cuentas] purga de usuario %s falló: %s",
                       getattr(u, "id", "?"), exc_resumen(e))
        await rollback_seguro(db, "_intentar_purgar_usuario")


async def _revocar_sesiones_usuario(db: AsyncSession, usuario_id: int,
                                     jti: str | None = None) -> int:
    """Revoca sesiones activas del usuario (todas, o solo el jti dado).

    Fuente única para /logout, /logout-all y /sesiones/revocar-todas.
    No hace commit (lo hace el endpoint dueño de la transacción).
    """
    from app.models import Sesion
    conds = [Sesion.usuario_id == usuario_id, Sesion.revocado.is_(False)]
    if jti:
        conds.append(Sesion.jti == jti)
    res = await db.execute(select(Sesion).where(*conds))
    n = 0
    for s in res.scalars().all():
        s.revocado = True
        s.revocado_en = datetime.now(timezone.utc)
        n += 1
    return n


def _respuesta_login(token: str, rol: str, mock: bool) -> dict:
    return {"access_token": token, "token_type": "bearer",
            "expires_in_hours": settings.ACCESS_TOKEN_EXPIRE_HOURS, "rol": rol, "mock": mock}
