"""Login con Google (Supabase OAuth) con vinculación de identidad."""
import logging
from fastapi import APIRouter
import asyncio
import secrets
from datetime import datetime, timezone
from fastapi import HTTPException, Depends, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.db_utils import rollback_seguro
from app.core.logseguro import exc_resumen
from app.core.net import client_ip, ip_para_limites
from app.core.rate_limit import registrar_intento_persistente, verificar_intentos_fallidos
from app.db.session import get_session
from app.core.dominio import Rol
from app.core.normalizacion import normalizar_email
from app.routers.auth.comun import (
    _emitir_token_con_sesion,
    _gracia_restante,
    _hash_password_async,
    _intentar_purgar_usuario,
    _respuesta_login,
    normalizar_telefono,
    validar_foto_url,
)
from app.routers.auth.esquemas import GoogleCallbackIn, LoginOut
from app.routers.auth.limites import _check_oauth_rate_limit

logger = logging.getLogger("alojau.auth")
router = APIRouter()

async def _verificar_jwt_google(data: "GoogleCallbackIn") -> dict:
    """Valida el JWT de Supabase contra JWKS (fail-closed 401 si no pasa).

    La verificación JWKS (red ≤8s en cache-miss) corre fuera del event loop.
    Retorna los claims verificados: el callback deriva `supabase_id` de
    ellos, nunca del valor que envía el cliente (anti-suplantación).

    Args:
        data: Payload del callback (requiere `supabase_jwt`).

    Returns:
        Claims verificados del token.

    Raises:
        HTTPException: 401 si el token es inválido o su email no coincide.
    """
    from app.core.auth_service import SupabaseAuthService
    try:
        claims = await asyncio.to_thread(
            SupabaseAuthService().decode_token, data.supabase_jwt
        )
    except HTTPException as e:
        # Observabilidad anti-manipulación: kid/alg del header para detectar
        # rotación de claves o tokens forjados. NUNCA token ni email (PII,
        # Ley 1581; CodeQL: sin secretos en logs).
        try:
            import jwt as _jwt
            _hdr = _jwt.get_unverified_header(data.supabase_jwt or "")
            logger.warning(
                "[oauth google] JWT rechazado (status=%s kid=%s alg=%s)",
                getattr(e, "status_code", "?"),
                str(_hdr.get("kid"))[:36],
                str(_hdr.get("alg"))[:10],
            )
        except Exception:
            logger.warning("[oauth google] JWT rechazado (header ilegible)")
        raise
    except Exception:
        logger.warning("[oauth google] JWT inválido (fallo interno de verificación)")
        raise HTTPException(status_code=401, detail="Token Supabase inválido")
    claim_email = normalizar_email(claims.get("email", ""))
    if claim_email and claim_email != normalizar_email(data.email):
        raise HTTPException(status_code=401, detail="El token Supabase no coincide con el email")
    return claims


# Google OAuth vía Supabase + identity linking anti-duplicados
@router.get("/oauth/google", summary="URL de login con Google (Supabase OAuth)")
async def oauth_google_url(redirect_to: str | None = None):
    """Retorna la authorization URL. `redirect_to` opcional debe estar en la
    allow-list (localhost:5173 o prod); si no, se usa prod por defecto.

    Si Supabase no está configurado (dev sin dashboard), retorna 503 con
    pasos manuales en vez de una URL rota (protocolo human-in-the-loop).
    """
    if not settings.supabase_configured:
        raise HTTPException(
            status_code=503,
            detail=("Google OAuth no configurado. En Supabase Dashboard -> Authentication -> "
                    "Providers -> Google: activa el proveedor y anade Redirect URLs "
                    "http://localhost:5173/auth/callback y "
                    "https://aloja-u.vercel.app/auth/callback. Luego define SUPABASE_URL."),
        )
    permitidas = settings.oauth_redirect_urls
    redirect = (redirect_to.rstrip("/") if redirect_to else "") or permitidas[1]
    if redirect not in permitidas:
        raise HTTPException(status_code=422, detail=f"redirect_to debe ser una de {permitidas}")
    base = settings.SUPABASE_URL.rstrip("/")
    url = (f"{base}/auth/v1/authorize?provider=google"
           f"&redirect_to={redirect}/auth/callback")
    return {"authorization_url": url,
            "redirect_urls": permitidas}


async def _supabase_id_confiable(db: AsyncSession, data: GoogleCallbackIn,
                                 claves_intento: tuple[str, ...]) -> str | None:
    """`supabase_id` de los claims verificados del JWT, nunca el que envía el cliente.

    Si llega JWT y Supabase está configurado, se valida contra JWKS (fail-closed:
    un JWT inválido cuenta como intento fallido). Sin JWT (dev/tests sin
    Supabase) se conserva `data.supabase_id`.
    """
    if not (data.supabase_jwt and settings.supabase_configured):
        return data.supabase_id
    try:
        claims = await _verificar_jwt_google(data)
    except HTTPException:
        for clave in claves_intento:
            await registrar_intento_persistente(db, clave, False)
        raise
    return str(claims.get("sub") or "")[:64] or data.supabase_id


async def _vincular_cuenta_existente(db: AsyncSession, email: str, supabase_id: str | None):
    """Vincula Google a la cuenta del email (revive si estaba en gracia).

    Retorna None si no hay cuenta o su gracia de borrado venció (se purga).
    """
    from app.models import Usuario
    res = await db.execute(select(Usuario).where(Usuario.email == email))
    usuario = res.scalars().first()
    if usuario is None:
        return None
    restan = _gracia_restante(usuario)
    if restan is not None and restan < 0:
        await _intentar_purgar_usuario(db, usuario)
        return None
    if restan is not None:
        usuario.eliminado_en = None  # el login con Google revive la cuenta
    # Linking: conserva el password manual (login dual) y marca Google.
    proveedor = getattr(usuario, "auth_provider", "password") or "password"
    if "google" not in proveedor:
        usuario.auth_provider = f"{proveedor}+google"
    _marcar_identidad_google(usuario, supabase_id)
    await db.commit()
    await db.refresh(usuario)
    return usuario


async def _crear_cuenta_google(db: AsyncSession, data: GoogleCallbackIn, email: str,
                               supabase_id: str | None, ip: str) -> tuple:
    """Crea un ESTUDIANTE verificado. Si otra petición lo creó antes, lo vincula.

    Retorna (usuario, es_nuevo).
    """
    from app.models import Usuario
    usuario = Usuario(
        nombre_completo=data.nombre_completo.strip()[:150],
        email=email,
        password_hash=await _hash_password_async(secrets.token_urlsafe(24)),
        # Google no entrega teléfono -> NULL (nunca placeholder).
        telefono_whatsapp=normalizar_telefono(data.telefono_whatsapp) if data.telefono_whatsapp else None,
        foto_perfil_url=validar_foto_url(data.foto_perfil_url),
        rol=Rol.ESTUDIANTE,
        telefono_verificado=False,
        email_verificado=True,
        auth_provider="google",
        supabase_id=supabase_id,
        acepto_tratamiento_datos=True,
        fecha_consentimiento=datetime.now(timezone.utc),
        ip_consentimiento=ip,
        version_politica=settings.POLITICA_VERSION,
    )
    db.add(usuario)
    es_nuevo = True
    try:
        await db.commit()
    except IntegrityError:
        # Perdió la carrera: otra petición creó la fila con el mismo email.
        await db.rollback()
        res = await db.execute(select(Usuario).where(Usuario.email == email))
        usuario = res.scalars().first()
        if usuario is None:
            raise
        _marcar_identidad_google(usuario, supabase_id)
        await db.commit()
        es_nuevo = False
    await db.refresh(usuario)
    return usuario, es_nuevo


def _marcar_identidad_google(usuario, supabase_id: str | None) -> None:
    if supabase_id:
        usuario.supabase_id = supabase_id
    usuario.email_verificado = True


@router.post("/oauth/google/callback", response_model=LoginOut,
             summary="Callback Google: linking por email, sin duplicados")
async def oauth_google_callback(data: GoogleCallbackIn, request: Request,
                                db: AsyncSession = Depends(get_session)):
    """Fusiona identidad Google con cuenta manual del mismo email.

    - Email normalizado (lower+trim) como clave de linking.
    - Si existe cuenta password con ese email: la vincula (auth_provider
      combinado, supabase_id guardado, email_verificado=True) y emite JWT.
    - Si no existe: crea ESTUDIANTE verificado con consentimiento Ley 1581
      implícito de Google (acepto=True, ip registrada, versión vigente).
    - Carrera concurrente: UNIQUE(email) + IntegrityError -> re-lee y vincula.
    """
    email = normalizar_email(data.email)
    # Anti-fuerza-bruta/DoS ANTES de la verificación JWKS (fetch de red) y la
    # BD: memoria (rápido) + persistente PG (sobrevive reinicios Render).
    _check_oauth_rate_limit(request)
    ip = client_ip(request)  # se registra con el consentimiento Ley 1581
    claves_intento = (f"oauth:ip:{ip_para_limites(request)}", f"oauth:email:{email}")
    await verificar_intentos_fallidos(db, claves_intento[0], limite=20, ventana_s=900)
    await verificar_intentos_fallidos(db, claves_intento[1], limite=10, ventana_s=900)
    supabase_id = await _supabase_id_confiable(db, data, claves_intento)
    try:
        usuario = await _vincular_cuenta_existente(db, email, supabase_id)
        es_nuevo = usuario is None
        if es_nuevo:
            usuario, es_nuevo = await _crear_cuenta_google(db, data, email, supabase_id, ip)
        token = await _emitir_token_con_sesion(db, usuario, request, email_verificado=True)
        for clave in claves_intento:
            await registrar_intento_persistente(db, clave, True)
        return {**_respuesta_login(token, usuario.rol, mock=False), "es_nuevo": es_nuevo}
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(db, "oauth_google_callback")
        logger.error(f"[oauth google] DB falló: {exc_resumen(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
