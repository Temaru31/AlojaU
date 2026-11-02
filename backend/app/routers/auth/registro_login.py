"""Registro (Ley 1581, rol base ESTUDIANTE) y login con rate-limit persistente."""
import logging
from fastapi import APIRouter
import re
from datetime import datetime, timezone
from fastapi import HTTPException, Depends, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.db_utils import rollback_seguro
from app.core.logseguro import exc_resumen
from app.core.net import client_ip
from app.core.rate_limit import registrar_intento_persistente, verificar_intentos_fallidos
from app.db.session import get_session
from app.core.flags import mock_enabled
from app.core.dominio import Rol
from app.fixtures.usuarios_demo import MOCK_USERS
from app.core.normalizacion import normalizar_email
from app.routers.auth.comun import _emitir_token_con_sesion, _gracia_restante, _hash_password_async, _intentar_purgar_usuario, _issue_token, _password_fuerte_v13, _respuesta_login, _verify_password_async, normalizar_telefono
from app.routers.auth.esquemas import LoginIn, LoginOut, RegisterIn, RegisterOut
from app.routers.auth.limites import _check_login_rate_limit
from app.routers.auth.otp_recuperacion import _crear_otp

logger = logging.getLogger("alojau.auth")
router = APIRouter()

# ---------------------------------------------------------------------------
# Registro (Ley 1581 obligatoria, rol base ESTUDIANTE)
# ---------------------------------------------------------------------------
@router.post("/register", response_model=RegisterOut, summary="Registro (Ley 1581, rol ESTUDIANTE)")
async def register(data: RegisterIn, request: Request, db: AsyncSession = Depends(get_session)):
    email = normalizar_email(data.email)
    _exigir_consentimiento(data)
    _exigir_password_registrable(data.password)
    telefono = _telefono_opcional_valido(data.telefono_whatsapp)
    try:
        await _liberar_email_para_registro(db, email)
        nuevo = await _crear_estudiante(db, data, email, telefono, client_ip(request))
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(db, "register")
        if isinstance(e, IntegrityError):
            # Carrera: otro registro concurrente creó el email -> se relee en
            # vez de duplicar (vinculación de identidad segura).
            existente = await _releer_usuario(db, email)
            if existente is not None:
                return _registro_out(existente)
        logger.error(f"[auth register] DB falló: {exc_resumen(e)}", exc_info=True)
        if not mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        return await _registrar_mock(data, email, telefono)
    await _enviar_otp_inicial(db, email)
    return _registro_out(nuevo)


def _exigir_consentimiento(data: RegisterIn) -> None:
    if not data.acepto_tratamiento_datos:
        raise HTTPException(
            status_code=422,
            detail="Debes aceptar los Términos y la Política de Tratamiento de Datos (Ley 1581 de 2012)",
        )


def _exigir_password_registrable(password: str) -> None:
    """Mínimo letras + números (compatibilidad); el mensaje guía hacia la política v13."""
    debil = _password_fuerte_v13(password)
    tiene_letras_y_numeros = (len(password) >= 8 and re.search(r"[A-Za-z]", password)
                              and re.search(r"[0-9]", password))
    if debil and not tiene_letras_y_numeros:
        raise HTTPException(status_code=422, detail=f"Contraseña débil: {debil}")


def _telefono_opcional_valido(crudo: str | None) -> str | None:
    """Teléfono opcional (perfilado progresivo): normalizado, o 422 si es inválido."""
    if not crudo:
        return None
    telefono = normalizar_telefono(crudo)
    if telefono is None:
        raise HTTPException(
            status_code=422,
            detail="Teléfono inválido: usa 10 dígitos (ej. 3001234567) o código país + número",
        )
    return telefono


async def _liberar_email_para_registro(db: AsyncSession, email: str) -> None:
    """400 si el email está en uso; 409 si está en gracia de borrado (se
    restaura, no se duplica); si la gracia venció, purga la cuenta vieja."""
    existente = await _releer_usuario(db, email, propagar_errores=True)
    if existente is None:
        return
    restan = _gracia_restante(existente)
    if restan is None:
        raise HTTPException(status_code=400, detail="Email ya registrado")
    if restan >= 0:
        raise HTTPException(
            status_code=409,
            detail=(f"Este correo está en proceso de eliminación "
                    f"(quedan {restan} días). Restáuralo en "
                    f"/api/auth/cuenta/restaurar."),
        )
    await _intentar_purgar_usuario(db, existente)


async def _crear_estudiante(db: AsyncSession, data: RegisterIn, email: str,
                            telefono: str | None, ip: str):
    """Persiste el usuario con rol base ESTUDIANTE y el consentimiento Ley 1581."""
    from app.models import Usuario
    nuevo = Usuario(
        nombre_completo=data.nombre_completo.strip(),
        email=email,
        password_hash=await _hash_password_async(data.password),
        telefono_whatsapp=telefono,
        rol=Rol.ESTUDIANTE,
        telefono_verificado=False,
        email_verificado=False,
        auth_provider="password",
        acepto_tratamiento_datos=True,
        fecha_consentimiento=datetime.now(timezone.utc),
        ip_consentimiento=ip,
        version_politica=settings.POLITICA_VERSION,
    )
    db.add(nuevo)
    await db.commit()
    await db.refresh(nuevo)
    return nuevo


async def _releer_usuario(db: AsyncSession, email: str, propagar_errores: bool = False):
    from app.models import Usuario
    try:
        res = await db.execute(select(Usuario).where(Usuario.email == email))
        return res.scalars().first()
    except Exception as e:
        if propagar_errores:
            raise
        logger.warning("[auth register] relectura tras conflicto falló: %s", exc_resumen(e))
        return None


async def _enviar_otp_inicial(db: AsyncSession, email: str) -> None:
    """No bloquea el registro si falla: el usuario puede pedir otro en /otp/solicitar."""
    try:
        await _crear_otp(db, email, "email_verify")
    except Exception as e:
        logger.warning("[auth register] no se pudo enviar el OTP inicial: %s", exc_resumen(e))


def _registro_out(usuario) -> dict:
    return {"id": usuario.id, "email": usuario.email, "rol": usuario.rol,
            "mock": False, "email_verificado": bool(usuario.email_verificado)}


async def _registrar_mock(data: RegisterIn, email: str, telefono: str | None) -> dict:
    """Registro en MOCK_USERS (solo dev/test sin PG)."""
    if email in MOCK_USERS or data.email in MOCK_USERS:
        raise HTTPException(status_code=400, detail="Email ya registrado (mock)")
    MOCK_USERS[email] = {
        "password": await _hash_password_async(data.password),
        "rol": Rol.ESTUDIANTE,
        "id": 90 + len(MOCK_USERS),
        "nombre_completo": data.nombre_completo,
        "telefono_whatsapp": telefono,
        "telefono_verificado": False,
        "email_verificado": False,
    }
    return {"id": MOCK_USERS[email]["id"], "email": email, "rol": Rol.ESTUDIANTE,
            "mock": True, "email_verificado": False}


# ---------------------------------------------------------------------------
# Login (rate-limit memoria + persistente, sesiones registradas)
# ---------------------------------------------------------------------------
@router.post("/login", response_model=LoginOut, summary="Login JWT HS256 (expira según settings, hoy 2h T2)")
async def login(data: LoginIn, request: Request, db: AsyncSession = Depends(get_session)):
    _check_login_rate_limit(request)
    email = normalizar_email(data.email)
    claves_intento = (f"login:ip:{client_ip(request)}", f"login:user:{email}")
    for clave in claves_intento:
        await verificar_intentos_fallidos(db, clave)
    try:
        usuario = await _usuario_vigente_por_email(db, email)
        if usuario is not None:
            return await _login_con_usuario(db, usuario, data.password, request, claves_intento)
    except HTTPException:
        raise
    except Exception as e:
        await rollback_seguro(db, "login")
        logger.error(f"[auth login] DB falló: {exc_resumen(e)}", exc_info=True)
        if not mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        return await _login_mock(email, data)
    if not mock_enabled():
        await registrar_intento_persistente(db, claves_intento[0], False)
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    return await _login_mock(email, data)


async def _usuario_vigente_por_email(db: AsyncSession, email: str):
    """Usuario del email, o None si no existe o su gracia de borrado venció.

    En gracia -> 403 con guía de restauración; gracia vencida -> purga física
    y se trata como inexistente.
    """
    from app.models import Usuario
    res = await db.execute(select(Usuario).where(Usuario.email == email))
    usuario = res.scalars().first()
    restan = _gracia_restante(usuario) if usuario is not None else None
    if restan is None:
        return usuario
    if restan >= 0:
        raise HTTPException(
            status_code=403,
            detail=(f"Tu cuenta está en proceso de eliminación "
                    f"(quedan {restan} días). Restáurala en "
                    f"/api/auth/cuenta/restaurar o crea una nueva tras la purga."),
        )
    await _intentar_purgar_usuario(db, usuario)
    return None


async def _login_con_usuario(db: AsyncSession, usuario, password: str, request: Request,
                             claves_intento: tuple[str, ...]) -> dict:
    """Verifica la contraseña, registra el intento y emite un jti nuevo.

    Una revocación global invalida los jti viejos, pero el login con
    credenciales sigue permitido.
    """
    exito = await _verify_password_async(password, usuario.password_hash)
    for clave in claves_intento:
        await registrar_intento_persistente(db, clave, exito)
    if not exito:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    token = await _emitir_token_con_sesion(
        db, usuario, request, bool(getattr(usuario, "email_verificado", False)))
    return _respuesta_login(token, usuario.rol, mock=False)


async def _login_mock(email: str, data: LoginIn) -> dict:
    """Login contra MOCK_USERS (solo dev/test sin PG)."""
    u = MOCK_USERS.get(email) or MOCK_USERS.get(data.email)
    if not u or not await _verify_password_async(data.password, u["password"]):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    token = _issue_token(u["id"], email, u["rol"], True, bool(u.get("email_verificado", True)))
    return _respuesta_login(token, u["rol"], mock=True)
