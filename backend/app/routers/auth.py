"""Auth enterprise v13: registro Ley 1581, login con rate-limit persistente,
verificación email + OTP, recovery un solo uso, Google OAuth + linking,
sesiones revocables y promoción ESTUDIANTE->ARRENDADOR.

Compatibilidad: conserva todos los endpoints y contratos previos
(/register, /login, /perfil, /perfil/password, solicitud-verificacion).
Los tokens legacy sin scopes/jti siguen válidos (enriquecidos por rol).
"""
import hashlib
import logging
import re
import secrets
import time
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, EmailStr, Field, model_validator
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.security import hash_password, verify_password, create_token, get_current_user
from ..core.config import settings
from ..db.session import get_session

logger = logging.getLogger("alojau.auth")

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Mock users (sin BD, solo dev). Claves demo ÚNICAS: AlojaU123 (igual que seed_db.py).
MOCK_USERS = {
    "arrendador@alojau.com": {
        "password": hash_password("AlojaU123"),
        "rol": "ARRENDADOR",
        "id": 1,
        "nombre_completo": "Arrendador Demo",
        "telefono_whatsapp": "573001234567",
        "telefono_verificado": False,
        "email_verificado": True,
    },
    "admin@alojau.com": {
        "password": hash_password("AlojaU123"),
        "rol": "ADMIN",
        "id": 2,
        "nombre_completo": "Administrador AlojaU",
        "telefono_whatsapp": "573009998877",
        "telefono_verificado": True,
        "email_verificado": True,
    },
    "estudiante@alojau.com": {
        "password": hash_password("AlojaU123"),
        "rol": "ESTUDIANTE",
        "id": 3,
        "nombre_completo": "Estudiante Demo",
        "telefono_whatsapp": "573001112233",
        "telefono_verificado": False,
        "email_verificado": False,
    },
}


def _mock_enabled() -> bool:
    return bool(getattr(settings, "mock_enabled", False))


def _norm_email(email: str) -> str:
    return str(email or "").strip().lower()


# ---------------------------------------------------------------------------
# v13.2 marketplace: normalización y validación de perfil flexible.
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


def _ip_valida(txt: str) -> str | None:
    """Valida IPv4/IPv6 (sin puertos). Retorna None si no es IP pública válida."""
    import ipaddress
    try:
        cand = (txt or "").strip().split("%")[0]
        ip = ipaddress.ip_address(cand)
        if ip.is_loopback or ip.is_unspecified:
            return None
        return cand[:45]
    except Exception:
        return None


def _client_ip(request: Request | None) -> str:
    """IP pública real del cliente detrás de proxy (Render) para Ley 1581.

    v13.1: orden de precedencia (primera válida gana):
      1) X-Forwarded-For: primera IP de la lista (la pone Render).
      2) X-Real-IP. 3) request.client.host. 4) "unknown".
    A diferencia de la versión anterior, los headers se leen aunque
    request.client sea None, y cada candidata se valida como IP.
    """
    try:
        headers = getattr(request, "headers", None) if request else None
        if headers is not None:
            fwd = headers.get("x-forwarded-for")
            if fwd:
                for parte in str(fwd).split(","):
                    ip = _ip_valida(parte)
                    if ip:
                        return ip
            real = headers.get("x-real-ip")
            if real:
                ip = _ip_valida(real)
                if ip:
                    return ip
        if request and request.client and request.client.host:
            ip = _ip_valida(request.client.host)
            if ip:
                return ip
            return str(request.client.host)[:45]
    except Exception:
        pass
    return "unknown"


# ---------------------------------------------------------------------------
# Esquemas
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    nombre_completo: str = Field(min_length=3, max_length=150)
    # v13.2 progressive profiling: teléfono opcional al registrarse
    # (se exige al publicar). None/'' = sin vincular.
    telefono_whatsapp: Optional[str] = Field(default=None, max_length=20)
    # Ley 1581/2012: consentimiento explícito obligatorio.
    acepto_tratamiento_datos: bool = Field(default=False)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class PerfilOut(BaseModel):
    id: int
    email: EmailStr
    nombre_completo: str
    telefono_whatsapp: Optional[str] = None
    telefono_verificado: bool = False
    rol: str
    email_verificado: bool = False
    auth_provider: str = "password"
    # v13.2 marketplace flexible:
    bio: Optional[str] = None
    foto_perfil_url: Optional[str] = None
    preferencias: dict = Field(default_factory=dict)


class PerfilUpdateIn(BaseModel):
    # OLA2-M4: telefono_verificado es SOLO-LECTURA (lo calcula/muestra el backend).
    nombre_completo: Optional[str] = Field(default=None, min_length=3, max_length=150)
    # v13.2: None/'' limpia el teléfono (NULL). Con dígitos se normaliza E.164.
    telefono_whatsapp: Optional[str] = Field(default=None, max_length=20)
    bio: Optional[str] = Field(default=None, max_length=500)
    foto_perfil_url: Optional[str] = Field(default=None, max_length=500)
    # v13.2: merge-parcial (solo las claves enviadas se actualizan).
    preferencias: Optional[dict] = None


def _verificar_jwt_google(data: "GoogleCallbackIn") -> None:
    """Valida el JWT de Supabase contra JWKS (fail-closed 401 si no pasa).

    Args:
        data: Payload del callback (requiere `supabase_jwt`).

    Raises:
        HTTPException: 401 si el token es inválido o su email no coincide.
    """
    from ..core.auth_service import SupabaseAuthService
    try:
        claims = SupabaseAuthService().decode_token(data.supabase_jwt)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Token Supabase inválido")
    claim_email = _norm_email(claims.get("email", ""))
    if claim_email and claim_email != _norm_email(data.email):
        raise HTTPException(status_code=401, detail="El token Supabase no coincide con el email")


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
    """PerfilOut desde fila Usuario (incluye campos flexibles v13.2)."""
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
    )


def _perfil_out_mock(m: dict, email, user_id, user: dict | None = None) -> "PerfilOut":
    """PerfilOut desde MOCK_USERS (incluye campos flexibles v13.2)."""
    user = user or {}
    return PerfilOut(
        id=m.get("id", user_id or 1),
        email=email,
        nombre_completo=m.get("nombre_completo", "Arrendador Demo"),
        telefono_whatsapp=m.get("telefono_whatsapp"),
        telefono_verificado=bool(m.get("telefono_verificado", False)),
        rol=m.get("rol", "ARRENDADOR"),
        email_verificado=bool(m.get("email_verificado", True)),
        auth_provider=m.get("auth_provider", "password"),
        bio=m.get("bio"),
        foto_perfil_url=m.get("foto_perfil_url"),
        preferencias=m.get("preferencias") or {},
    )


class RegisterOut(BaseModel):
    id: int
    email: EmailStr
    rol: str
    mock: bool = False
    email_verificado: bool = False


class LoginOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_hours: int = 8
    rol: str
    mock: bool = False
    # Callbacks Google: True si esta petición creó la cuenta (mostrar
    # "¡Cuenta creada!" en vez de "Bienvenido de nuevo"). Solo informativo.
    es_nuevo: bool = False


class PasswordChangeIn(BaseModel):
    actual: str = Field(min_length=1, max_length=72)
    nueva: str = Field(min_length=8, max_length=72)


class OtpSolicitarIn(BaseModel):
    email: EmailStr
    proposito: str = Field(default="email_verify", pattern="^(email_verify|login|recovery)$")


class OtpVerificarIn(BaseModel):
    email: EmailStr
    codigo: str = Field(min_length=6, max_length=6, pattern="^[0-9]{6}$")
    proposito: str = Field(default="email_verify", pattern="^(email_verify|login|recovery)$")


class RecoverySolicitarIn(BaseModel):
    email: EmailStr


class RecoveryConfirmarIn(BaseModel):
    email: EmailStr
    token: str = Field(min_length=20, max_length=128)
    nueva_password: str = Field(min_length=8, max_length=72)


class GoogleCallbackIn(BaseModel):
    """Callback de Supabase OAuth: el frontend envía el perfil verificado.

    Flujo real: el usuario vuelve de Google a {frontend}/auth/callback con
    el JWT de Supabase; el frontend lo valida y envía aquí email + supabase_id
    + nombre para linking/creación. Si SUPABASE está configurado, el backend
    puede validar el supabase_jwt contra JWKS (fail-closed 401 si no pasa).
    """
    email: EmailStr
    nombre_completo: str = Field(min_length=1, max_length=150)
    supabase_id: Optional[str] = Field(default=None, max_length=64)
    supabase_jwt: Optional[str] = None
    # v13.2: Google no entrega teléfono; None = sin vincular (no placeholder).
    telefono_whatsapp: Optional[str] = Field(default=None, max_length=20)
    # v13.2: avatar de Google (picture). Se valida https:// en el endpoint.
    foto_perfil_url: Optional[str] = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _nombre_nunca_vacio(self):
        """v13.1: fallback seguro si Google devuelve nombre <2 caracteres
        (ej. 'a@domain.com'). Nunca 422: sanitiza en vez de rechazar."""
        nombre = (self.nombre_completo or "").strip()
        if len(nombre) < 2:
            local = str(self.email).split("@")[0].strip() or "google"
            nombre = f"Usuario {local}"[:150].strip()
        self.nombre_completo = nombre
        return self


class SesionOut(BaseModel):
    jti: str
    ip: Optional[str] = None
    creado_en: Optional[str] = None
    actual: bool = False


# ---------------------------------------------------------------------------
# Rate-limit: memoria (rápido) + persistencia PG (sobrevive reinicios Render).
# Bloqueo temporal 15 min tras 5 fallidos por IP/usuario (v13).
# ---------------------------------------------------------------------------
_LOGIN_ATTEMPTS: dict[str, list[float]] = {}
LOGIN_LIMIT = 5
LOGIN_WINDOW_S = 60.0
LOGIN_BLOCK_S = 15 * 60.0

_PW_ATTEMPTS: dict[str, list[float]] = {}
PW_LIMIT = 5
PW_WINDOW_S = 60.0


def _check_password_rate_limit(uid: str) -> None:
    now = time.monotonic()
    hist = [t for t in _PW_ATTEMPTS.get(uid, []) if now - t < PW_WINDOW_S]
    if len(hist) >= PW_LIMIT:
        raise HTTPException(status_code=429, detail="Demasiados intentos, espera 1 minuto")
    hist.append(now)
    _PW_ATTEMPTS[uid] = hist


async def _db_rate_check(db: AsyncSession, clave: str, limite: int = 5,
                         ventana_s: int = 900) -> None:
    """v13: cuenta fallidos recientes en PG. v14.1 fail-closed con logging.

    Error DB: dev/mock -> warning + permite (resiliencia local sin PG);
    prod -> 503 ruidoso (nunca desactivar anti-fuerza-bruta en silencio).
    """
    try:
        from ..models import RateLimitAttempt
        corte = datetime.now(timezone.utc) - timedelta(seconds=ventana_s)
        stmt = select(func.count()).select_from(RateLimitAttempt).where(
            RateLimitAttempt.clave == clave,
            RateLimitAttempt.exito.is_(False),
            RateLimitAttempt.creado_en >= corte,
        )
        n = (await db.execute(stmt)).scalar() or 0
        if n >= limite:
            raise HTTPException(
                status_code=429,
                detail="Demasiados intentos. Cuenta bloqueada temporalmente 15 minutos.",
            )
    except HTTPException:
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error("[rate-limit] verificación persistente falló (fail-closed): %r", e)
        if _mock_enabled():
            logger.warning("[rate-limit] sin PG en dev: solo rige el límite en memoria")
            return
        raise HTTPException(status_code=503, detail="Servicio de protección no disponible")


async def _db_rate_record(db: AsyncSession, clave: str, exito: bool) -> None:
    # Best-effort a propósito: un fallo al registrar NUNCA debe tumbar un
    # login legítimo (el check fail-closed ya protege el conteo).
    try:
        from ..models import RateLimitAttempt
        db.add(RateLimitAttempt(clave=clave[:180], exito=bool(exito)))
        await db.commit()
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.warning("[rate-limit] no se pudo registrar intento: %r", e)


def _check_login_rate_limit(request: Request):
    ip = request.client.host if request.client and request.client.host else "unknown"
    now = time.monotonic()
    hist = _LOGIN_ATTEMPTS.get(ip, [])
    hist = [t for t in hist if now - t < LOGIN_WINDOW_S]
    if len(hist) >= LOGIN_LIMIT:
        raise HTTPException(status_code=429, detail="Demasiados intentos de login, espera 1 minuto (B0-7)")
    hist.append(now)
    _LOGIN_ATTEMPTS[ip] = hist


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
                 email_verificado: bool = False) -> str:
    from app.core.permissions import scopes_for_role
    return create_token({
        "sub": email,
        "rol": rol,
        "id": usuario_id,
        "telefono_verificado": bool(telefono_verificado),
        "email_verificado": bool(email_verificado),
        "scopes": sorted(scopes_for_role(rol)),
    })


async def _registrar_sesion(db: AsyncSession, usuario_id: int, jti: str,
                            request: Request | None) -> None:
    """Guarda la sesión para revocación global. Sin tabla -> noop."""
    try:
        from ..models import Sesion
        ua = None
        try:
            ua = (request.headers.get("user-agent", "") if request else "")[:255] or None
        except Exception:
            ua = None
        db.add(Sesion(
            usuario_id=usuario_id, jti=jti,
            ip=_client_ip(request), user_agent=ua,
        ))
        await db.commit()
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Registro (Ley 1581 obligatoria, rol base ESTUDIANTE)
# ---------------------------------------------------------------------------
@router.post("/register", response_model=RegisterOut, summary="Registro (Ley 1581, rol ESTUDIANTE)")
async def register(data: RegisterIn, request: Request, db: AsyncSession = Depends(get_session)):
    email = _norm_email(data.email)
    if not data.acepto_tratamiento_datos:
        raise HTTPException(
            status_code=422,
            detail="Debes aceptar los Términos y la Política de Tratamiento de Datos (Ley 1581 de 2012)",
        )
    debil = _password_fuerte_v13(data.password)
    if debil and not (len(data.password) >= 8 and re.search(r"[A-Za-z]", data.password)
                      and re.search(r"[0-9]", data.password)):
        # Compat: se exige al menos letras+números; el mensaje guía hacia v13.
        raise HTTPException(status_code=422, detail=f"Contraseña débil: {debil}")
    ip = _client_ip(request)
    # v13.2: teléfono opcional (progressive profiling). Si viene, normaliza;
    # si es inválido, 422 con guía (nunca se guarda basura).
    tel = None
    if data.telefono_whatsapp:
        tel = normalizar_telefono(data.telefono_whatsapp)
        if tel is None:
            raise HTTPException(
                status_code=422,
                detail="Teléfono inválido: usa 10 dígitos (ej. 3001234567) o código país + número",
            )
    try:
        from ..models import Usuario
        existing = await db.execute(select(Usuario).where(Usuario.email == email))
        ex = existing.scalars().first()
        if ex is not None:
            # v13.1: email en período de gracia -> 409 (restaurar, no duplicar);
            # gracia vencida -> purga física y se permite re-registrar.
            restan = _gracia_restante(ex)
            if restan is not None and restan >= 0:
                raise HTTPException(
                    status_code=409,
                    detail=(f"Este correo está en proceso de eliminación "
                            f"(quedan {restan} días). Restáuralo en "
                            f"/api/auth/cuenta/restaurar."),
                )
            if restan is not None:
                try:
                    await _purge_user(db, ex)
                except Exception:
                    pass
            else:
                raise HTTPException(status_code=400, detail="Email ya registrado")
        nuevo = Usuario(
            nombre_completo=data.nombre_completo.strip(),
            email=email,
            password_hash=hash_password(data.password),
            telefono_whatsapp=tel,
            rol="ESTUDIANTE",
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
        # OTP de verificación (no bloquea el registro si el envío falla).
        try:
            await _crear_otp(db, email, "email_verify")
        except Exception:
            pass
        return {"id": nuevo.id, "email": nuevo.email, "rol": nuevo.rol,
                "mock": False, "email_verificado": False}
    except HTTPException:
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        # Race-condition linking: UNIQUE violada por registro concurrente ->
        # re-lee en vez de duplicar (identity linking seguro).
        if isinstance(e, IntegrityError):
            try:
                existing = await db.execute(select(Usuario).where(Usuario.email == email))
                u = existing.scalars().first()
                if u:
                    return {"id": u.id, "email": u.email, "rol": u.rol,
                            "mock": False, "email_verificado": bool(u.email_verificado)}
            except Exception:
                pass
        logger.error(f"[auth register] DB falló: {e!r}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        if email in MOCK_USERS or data.email in MOCK_USERS:
            raise HTTPException(status_code=400, detail="Email ya registrado (mock)")
        MOCK_USERS[email] = {
            "password": hash_password(data.password),
            "rol": "ESTUDIANTE",
            "id": 90 + len(MOCK_USERS),
            "nombre_completo": data.nombre_completo,
            "telefono_whatsapp": tel,
            "telefono_verificado": False,
            "email_verificado": False,
        }
        return {"id": MOCK_USERS[email]["id"], "email": email, "rol": "ESTUDIANTE",
                "mock": True, "email_verificado": False}


# ---------------------------------------------------------------------------
# v13.1: soft-delete de cuentas (gracia 30 días + purga física + restore).
# ---------------------------------------------------------------------------
CUENTA_GRACE_DAYS = 30


def _gracia_restante(u) -> int | None:
    """Días restantes de gracia, None si la cuenta está activa."""
    elim = getattr(u, "eliminado_en", None)
    if elim is None:
        return None
    if getattr(elim, "tzinfo", None) is None:
        elim = elim.replace(tzinfo=timezone.utc)
    fin = elim + timedelta(days=CUENTA_GRACE_DAYS)
    restan = (fin - datetime.now(timezone.utc)).days
    return restan


async def _purge_user(db: AsyncSession, u) -> None:
    """Borrado físico: cascadas (publicaciones, sesiones) + SET NULL (reportes)."""
    await db.delete(u)
    await db.commit()


async def _revocar_sesiones_usuario(db: AsyncSession, usuario_id: int) -> int:
    from ..models import Sesion
    res = await db.execute(
        select(Sesion).where(Sesion.usuario_id == usuario_id, Sesion.revocado.is_(False)))
    n = 0
    for s in res.scalars().all():
        s.revocado = True
        s.revocado_en = datetime.now(timezone.utc)
        n += 1
    return n


class CuentaEliminarIn(BaseModel):
    """Doble confirmación: email escrito a mano + contraseña (si tiene)."""
    confirm_email: EmailStr
    password: Optional[str] = Field(default=None, max_length=72)


class CuentaRestaurarIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


# ---------------------------------------------------------------------------
# Login (rate-limit memoria + persistente, sesiones registradas)
# ---------------------------------------------------------------------------
@router.post("/login", response_model=LoginOut, summary="Login JWT HS256 8h")
async def login(data: LoginIn, request: Request, db: AsyncSession = Depends(get_session)):
    _check_login_rate_limit(request)
    email = _norm_email(data.email)
    ip = _client_ip(request)
    await _db_rate_check(db, f"login:ip:{ip}")
    await _db_rate_check(db, f"login:user:{email}")
    try:
        from ..models import Usuario
        res = await db.execute(select(Usuario).where(Usuario.email == email))
        u_db = res.scalars().first()
        if u_db is not None:
            # v13.1 soft-delete: en gracia -> 403 con guía de restore;
            # gracia vencida -> purga física y se trata como inexistente.
            restan = _gracia_restante(u_db)
            if restan is not None:
                if restan >= 0:
                    raise HTTPException(
                        status_code=403,
                        detail=(f"Tu cuenta está en proceso de eliminación "
                                f"(quedan {restan} días). Restáurala en "
                                f"/api/auth/cuenta/restaurar o crea una nueva tras la purga."),
                    )
                try:
                    await _purge_user(db, u_db)
                except Exception:
                    pass
                u_db = None
        if u_db is not None:
            # Sesión revocada globalmente -> el jti viejo ya no vale, pero el
            # login con credenciales sigue permitido (emite jti nuevo).
            if not verify_password(data.password, u_db.password_hash):
                await _db_rate_record(db, f"login:ip:{ip}", False)
                await _db_rate_record(db, f"login:user:{email}", False)
                raise HTTPException(status_code=401, detail="Credenciales inválidas")
            await _db_rate_record(db, f"login:ip:{ip}", True)
            await _db_rate_record(db, f"login:user:{email}", True)
            token = _issue_token(u_db.id, u_db.email, u_db.rol,
                                 bool(u_db.telefono_verificado),
                                 bool(getattr(u_db, "email_verificado", False)))
            try:
                import jwt as _jwt
                jti = _jwt.decode(token, options={"verify_signature": False}).get("jti", "")
                await _registrar_sesion(db, u_db.id, jti, request)
            except Exception:
                pass
            return {"access_token": token, "token_type": "bearer",
                    "expires_in_hours": 8, "rol": u_db.rol, "mock": False}
        if not _mock_enabled():
            await _db_rate_record(db, f"login:ip:{ip}", False)
            raise HTTPException(status_code=401, detail="Credenciales inválidas")
        u = MOCK_USERS.get(email) or MOCK_USERS.get(data.email)
        if not u or not verify_password(data.password, u["password"]):
            raise HTTPException(status_code=401, detail="Credenciales inválidas")
        token = _issue_token(u["id"], email, u["rol"], True, bool(u.get("email_verificado", True)))
        return {"access_token": token, "token_type": "bearer",
                "expires_in_hours": 8, "rol": u["rol"], "mock": True}
    except HTTPException:
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[auth login] DB falló: {e!r}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        u = MOCK_USERS.get(email) or MOCK_USERS.get(data.email)
        if not u or not verify_password(data.password, u["password"]):
            raise HTTPException(status_code=401, detail="Credenciales inválidas")
        token = _issue_token(u["id"], email, u["rol"], True, bool(u.get("email_verificado", True)))
        return {"access_token": token, "token_type": "bearer",
                "expires_in_hours": 8, "rol": u["rol"], "mock": True}


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
        from ..models import Usuario
        u = None
        if user_id:
            u = await db.get(Usuario, user_id)
        elif email:
            res = await db.execute(select(Usuario).where(Usuario.email == _norm_email(email)))
            u = res.scalars().first()
        if u:
            # v14.1: la revocación JTI ya la aplica get_current_user (central).
            return _perfil_out_db(u)
        if not _mock_enabled():
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[auth get_perfil] DB falló: {e!r}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")

    m = MOCK_USERS.get(email) or MOCK_USERS.get(_norm_email(email or ""))
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
            rol=user.get("rol", "ARRENDADOR"),
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
        from ..models import Usuario
        u = None
        if user_id:
            u = await db.get(Usuario, user_id)
        elif email:
            res = await db.execute(select(Usuario).where(Usuario.email == _norm_email(email)))
            u = res.scalars().first()
        if u:
            if not verify_password(data.actual, u.password_hash):
                raise HTTPException(status_code=403, detail="La contraseña actual no coincide")
            u.password_hash = hash_password(data.nueva)
            await db.commit()
            return {"mensaje": "Contraseña actualizada con éxito."}
        if not _mock_enabled():
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
    except HTTPException:
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[auth password] DB falló: {e!r}", exc_info=True)
        if not _mock_enabled():
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
    if not verify_password(data.actual, m["password"]):
        raise HTTPException(status_code=403, detail="La contraseña actual no coincide")
    m["password"] = hash_password(data.nueva)
    return {"mensaje": "Contraseña actualizada con éxito."}


@router.post("/perfil/solicitud-verificacion", status_code=202, summary="Solicitar verificación de teléfono")
async def solicitar_verificacion(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    return {"mensaje": "Solicitud registrada. Un administrador verificará tu línea.", "estado": "PENDIENTE"}


@router.patch("/perfil", response_model=PerfilOut, summary="Actualizar nombre y teléfono (verificación solo-lectura)")
async def update_perfil(
    data: PerfilUpdateIn,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    email = user.get("sub")
    user_id = user.get("id")
    try:
        from ..models import Usuario
        u = None
        if user_id:
            u = await db.get(Usuario, user_id)
        elif email:
            res = await db.execute(select(Usuario).where(Usuario.email == _norm_email(email)))
            u = res.scalars().first()
        if u:
            cambios = _sanitizar_cambios_perfil(data)
            if "nombre" in cambios:
                u.nombre_completo = cambios["nombre"]
            # v13.2: None desvincula (y pierde verificación); cambio real
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
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(u, "preferencias")
            await db.commit()
            await db.refresh(u)
            return _perfil_out_db(u)
        if not _mock_enabled():
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
    except HTTPException:
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[auth update_perfil] DB falló: {e!r}", exc_info=True)
        if not _mock_enabled():
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
            "password": hash_password("AlojaU123"),
            "rol": user.get("rol", "ARRENDADOR"),
            "id": user_id or 1,
            "nombre_completo": "Arrendador Demo",
            "telefono_whatsapp": "573001234567",
            "telefono_verificado": False,
            "email_verificado": False,
        }
        MOCK_USERS[email or "arrendador@alojau.com"] = m

    if data.nombre_completo is not None:
        m["nombre_completo"] = data.nombre_completo
    # v13.2: espejo del comportamiento DB en mocks (vía sanitizador común).
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

    try:
        from .publicaciones import MOCK_PUBS
        for pub in MOCK_PUBS:
            if pub.get("usuario_id") == m.get("id"):
                if "telefono_whatsapp" in data.model_fields_set:
                    pub["telefono_whatsapp"] = m.get("telefono_whatsapp")
    except Exception:
        pass

    return _perfil_out_mock(m, email, user_id, user)


# ---------------------------------------------------------------------------
# v13: OTP ligero (6 dígitos, 10 min) vía Email o Telegram webhook gratuito
# ---------------------------------------------------------------------------
_MOCK_OTPS: dict[str, dict] = {}


async def _crear_otp(db: AsyncSession, email: str, proposito: str) -> str:
    """Genera y persiste OTP. Retorna el código plano (solo para tests/dev).

    En prod el código viaja por Email/Telegram, nunca en la respuesta.
    """
    email = _norm_email(email)
    codigo = f"{secrets.randbelow(1_000_000):06d}"
    expira = datetime.now(timezone.utc) + timedelta(minutes=10)
    try:
        from ..models import OtpCode
        db.add(OtpCode(
            email=email, codigo_hash=hashlib.sha256(codigo.encode()).hexdigest(),
            proposito=proposito, expira_en=expira,
        ))
        await db.commit()
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass
        _MOCK_OTPS[f"{email}:{proposito}"] = {
            "hash": hashlib.sha256(codigo.encode()).hexdigest(),
            "expira": time.monotonic() + 600,
        }
    _enviar_codigo(email, codigo, proposito)
    return codigo


def _enviar_codigo(email: str, codigo: str, proposito: str) -> None:
    """Envía el OTP: Telegram si hay bot configurado, si no log (dev)."""
    if settings.TELEGRAM_BOT_TOKEN.strip():
        try:
            import urllib.request
            import urllib.parse
            import json
            chat = settings.TELEGRAM_CHAT_ID.strip()
            if chat:
                texto = f"AlojaU ({proposito}): tu código es {codigo}. Expira en 10 minutos."
                data = urllib.parse.urlencode(
                    {"chat_id": chat, "text": texto}).encode()
                req = urllib.request.Request(
                    f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage",
                    data=data, headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
                with urllib.request.urlopen(req, timeout=8) as _:
                    pass
                return
        except Exception as e:
            logger.warning(f"[otp telegram] falló, usando log: {e!r}")
    # Sin Telegram o sin chat: Email-code simulado (log). En prod con
    # Supabase se envía vía Supabase Auth email; aquí queda trazabilidad.
    logger.info(f"[otp {proposito}] código para {email}: {codigo} (10 min)")


# v14.1: throttle OTP en memoria (cubre mock/dev) + persistente (prod).
_OTP_SOLICITAR: dict[str, list[float]] = {}
_OTP_VERIFICAR: dict[str, list[float]] = {}
OTP_SOL_LIMIT = 5
OTP_SOL_WINDOW_S = 900.0
OTP_VER_LIMIT = 10
OTP_VER_WINDOW_S = 600.0


def _check_otp_mem(store: dict[str, list[float]], clave: str, limite: int,
                   ventana_s: float, mensaje: str) -> None:
    ahora = time.monotonic()
    hist = [t for t in store.get(clave, []) if ahora - t < ventana_s]
    if len(hist) >= limite:
        raise HTTPException(status_code=429, detail=mensaje)
    hist.append(ahora)
    store[clave] = hist


@router.post("/otp/solicitar", status_code=202, summary="Solicitar código OTP 6 dígitos (10 min)")
async def otp_solicitar(data: OtpSolicitarIn, db: AsyncSession = Depends(get_session)):
    email = _norm_email(data.email)
    # v14.1 anti-spam/adivinanza: 5 solicitudes por email cada 15 min.
    _check_otp_mem(_OTP_SOLICITAR, email, OTP_SOL_LIMIT, OTP_SOL_WINDOW_S,
                   "Demasiadas solicitudes de código, espera 15 minutos")
    await _db_rate_check(db, f"otp_sol:{email}", limite=OTP_SOL_LIMIT, ventana_s=int(OTP_SOL_WINDOW_S))
    await _crear_otp(db, email, data.proposito)
    await _db_rate_record(db, f"otp_sol:{email}", False)
    return {"mensaje": "Si el correo existe, enviamos un código de 6 dígitos válido 10 minutos.",
            "expira_minutos": 10}


@router.post("/otp/verificar", summary="Verificar OTP y confirmar email")
async def otp_verificar(data: OtpVerificarIn, db: AsyncSession = Depends(get_session)):
    email = _norm_email(data.email)
    # v14.1 anti-fuerza-bruta (código de ~20 bits): 10 intentos cada 10 min.
    _check_otp_mem(_OTP_VERIFICAR, email, OTP_VER_LIMIT, OTP_VER_WINDOW_S,
                   "Demasiados intentos de código, espera 10 minutos")
    await _db_rate_check(db, f"otp_ver:{email}", limite=OTP_VER_LIMIT, ventana_s=int(OTP_VER_WINDOW_S))
    digest = hashlib.sha256(data.codigo.encode()).hexdigest()
    ok = False
    try:
        from ..models import OtpCode, Usuario
        stmt = select(OtpCode).where(
            OtpCode.email == email,
            OtpCode.proposito == data.proposito,
            OtpCode.consumido.is_(False),
            OtpCode.expira_en > datetime.now(timezone.utc),
        ).order_by(OtpCode.id.desc())
        row = (await db.execute(stmt)).scalars().first()
        if row and secrets.compare_digest(row.codigo_hash, digest):
            row.consumido = True
            ok = True
            if data.proposito == "email_verify":
                ures = await db.execute(select(Usuario).where(Usuario.email == email))
                u = ures.scalars().first()
                if u:
                    u.email_verificado = True
            await db.commit()
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass
    if not ok:
        # Fallback memoria (sin PG): valida contra _MOCK_OTPS.
        entry = _MOCK_OTPS.get(f"{email}:{data.proposito}")
        if entry and time.monotonic() < entry["expira"] and secrets.compare_digest(entry["hash"], digest):
            ok = True
            _MOCK_OTPS.pop(f"{email}:{data.proposito}", None)
            m = MOCK_USERS.get(email)
            if m and data.proposito == "email_verify":
                m["email_verificado"] = True
    if not ok:
        await _db_rate_record(db, f"otp_ver:{email}", False)
        raise HTTPException(status_code=401, detail="Código inválido o expirado")
    return {"mensaje": "Verificación exitosa.", "email_verificado": True}


# ---------------------------------------------------------------------------
# v13: Recovery un solo uso (15 min) + fortaleza v13
# ---------------------------------------------------------------------------
_MOCK_RESETS: dict[str, dict] = {}


@router.post("/recovery/solicitar", status_code=202, summary="Solicitar enlace de recuperación (15 min)")
async def recovery_solicitar(data: RecoverySolicitarIn, request: Request,
                             db: AsyncSession = Depends(get_session)):
    email = _norm_email(data.email)
    await _db_rate_check(db, f"recovery:{email}", limite=5, ventana_s=900)
    token = secrets.token_urlsafe(32)
    digest = hashlib.sha256(token.encode()).hexdigest()
    expira = datetime.now(timezone.utc) + timedelta(minutes=15)
    try:
        from ..models import PasswordReset
        db.add(PasswordReset(email=email, token_hash=digest, expira_en=expira))
        await db.commit()
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass
        _MOCK_RESETS[email] = {"hash": digest, "expira": time.monotonic() + 900}
    # Respuesta genérica anti-enumeración; en dev se loguea el token.
    logger.info(f"[recovery] token para {email} (15 min, un solo uso)")
    resp: dict = {"mensaje": "Si el correo existe, enviamos un enlace válido 15 minutos."}
    if settings.ENV != "prod" and _mock_enabled():
        resp["dev_token"] = token  # solo dev/test para e2e sin SMTP
    return resp


@router.post("/recovery/confirmar", summary="Confirmar recuperación con token de un solo uso")
async def recovery_confirmar(data: RecoveryConfirmarIn, db: AsyncSession = Depends(get_session)):
    email = _norm_email(data.email)
    err = _password_fuerte_v13(data.nueva_password)
    if err:
        raise HTTPException(status_code=422, detail=f"Contraseña débil: {err}")
    digest = hashlib.sha256(data.token.encode()).hexdigest()
    ok = False
    try:
        from ..models import PasswordReset, Usuario
        stmt = select(PasswordReset).where(
            PasswordReset.email == email,
            PasswordReset.token_hash == digest,
            PasswordReset.consumido.is_(False),
            PasswordReset.expira_en > datetime.now(timezone.utc),
        ).order_by(PasswordReset.id.desc())
        row = (await db.execute(stmt)).scalars().first()
        if row:
            ures = await db.execute(select(Usuario).where(Usuario.email == email))
            u = ures.scalars().first()
            if u:
                u.password_hash = hash_password(data.nueva_password)
                row.consumido = True
                await db.commit()
                # Revoca sesiones previas (el atacante con sesión vieja queda fuera).
                try:
                    from ..models import Sesion
                    sres = await db.execute(
                        select(Sesion).where(Sesion.usuario_id == u.id,
                                             Sesion.revocado.is_(False)))
                    for s in sres.scalars().all():
                        s.revocado = True
                        s.revocado_en = datetime.now(timezone.utc)
                    await db.commit()
                except Exception:
                    try:
                        await db.rollback()
                    except Exception:
                        pass
                ok = True
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass
    if not ok:
        entry = _MOCK_RESETS.get(email)
        if entry and time.monotonic() < entry["expira"] and secrets.compare_digest(entry["hash"], digest):
            ok = True
            _MOCK_RESETS.pop(email, None)
            m = MOCK_USERS.get(email)
            if m:
                m["password"] = hash_password(data.nueva_password)
    if not ok:
        raise HTTPException(status_code=401, detail="Enlace inválido, expirado o ya usado")
    return {"mensaje": "Contraseña restablecida. Sesiones anteriores revocadas."}


# ---------------------------------------------------------------------------
# v13: Google OAuth vía Supabase + identity linking anti-duplicados
# ---------------------------------------------------------------------------
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
    email = _norm_email(data.email)
    # Validación opcional del JWT Supabase contra JWKS (fail-closed si se envía).
    if data.supabase_jwt and settings.supabase_configured:
        _verificar_jwt_google(data)
    ip = _client_ip(request)
    es_nuevo = False
    try:
        from ..models import Usuario
        res = await db.execute(select(Usuario).where(Usuario.email == email))
        u = res.scalars().first()
        if u:
            # v13.1: si estaba en período de gracia, el login con Google la revive.
            restan = _gracia_restante(u)
            if restan is not None and restan < 0:
                try:
                    await _purge_user(db, u)
                except Exception:
                    pass
                u = None
            else:
                if restan is not None:
                    u.eliminado_en = None
                # Linking: conserva password manual (login dual) y marca Google.
                prov = getattr(u, "auth_provider", "password") or "password"
                if "google" not in prov:
                    u.auth_provider = f"{prov}+google" if prov else "google"
                if data.supabase_id:
                    u.supabase_id = data.supabase_id
                u.email_verificado = True
                await db.commit()
                await db.refresh(u)
        if not u:
            # v13.2: Google no entrega teléfono -> NULL (nunca placeholder).
            tel_g = normalizar_telefono(data.telefono_whatsapp) if data.telefono_whatsapp else None
            u = Usuario(                nombre_completo=data.nombre_completo.strip()[:150],
                email=email,
                password_hash=hash_password(secrets.token_urlsafe(24)),
                telefono_whatsapp=tel_g,
                foto_perfil_url=validar_foto_url(data.foto_perfil_url),
                rol="ESTUDIANTE",
                telefono_verificado=False,
                email_verificado=True,
                auth_provider="google",
                supabase_id=data.supabase_id,
                acepto_tratamiento_datos=True,
                fecha_consentimiento=datetime.now(timezone.utc),
                ip_consentimiento=ip,
                version_politica=settings.POLITICA_VERSION,
            )
            db.add(u)
            try:
                await db.commit()
                es_nuevo = True  # creado en esta petición (mensaje "¡Cuenta creada!")
            except IntegrityError:
                # Perdió la carrera: otro request creó la fila -> vincular.
                await db.rollback()
                res2 = await db.execute(select(Usuario).where(Usuario.email == email))
                u = res2.scalars().first()
                if not u:
                    raise
                if data.supabase_id:
                    u.supabase_id = data.supabase_id
                u.email_verificado = True
                await db.commit()
            await db.refresh(u)
        token = _issue_token(u.id, u.email, u.rol, bool(u.telefono_verificado), True)
        try:
            import jwt as _jwt
            jti = _jwt.decode(token, options={"verify_signature": False}).get("jti", "")
            await _registrar_sesion(db, u.id, jti, request)
        except Exception:
            pass
        return {"access_token": token, "token_type": "bearer",
                "expires_in_hours": 8, "rol": u.rol, "mock": False,
                "es_nuevo": es_nuevo}
    except HTTPException:
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[oauth google] DB falló: {e!r}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        m = MOCK_USERS.get(email)
        es_nuevo_mock = False
        if not m:
            es_nuevo_mock = True
            m = {
                "password": hash_password(secrets.token_urlsafe(16)),
                "rol": "ESTUDIANTE",
                "id": 90 + len(MOCK_USERS),
                "nombre_completo": data.nombre_completo,
                "telefono_whatsapp": (normalizar_telefono(data.telefono_whatsapp)
                                      if data.telefono_whatsapp else None),
                "telefono_verificado": False,
                "email_verificado": True,
                "auth_provider": "google",
            }
            try:
                m["foto_perfil_url"] = validar_foto_url(data.foto_perfil_url)
            except HTTPException:
                m["foto_perfil_url"] = None
            MOCK_USERS[email] = m
        else:
            m["email_verificado"] = True
            m["auth_provider"] = "google" if m.get("auth_provider") == "password" else f"{m.get('auth_provider','')}+google"
        token = _issue_token(m["id"], email, m["rol"], False, True)
        return {"access_token": token, "token_type": "bearer",
                "expires_in_hours": 8, "rol": m["rol"], "mock": True,
                "es_nuevo": es_nuevo_mock}


# ---------------------------------------------------------------------------
# v13: promoción dinámica ESTUDIANTE -> ARRENDADOR (al publicar)
# ---------------------------------------------------------------------------
async def promover_a_arrendador(db: AsyncSession, usuario_id: int) -> Optional[str]:
    """Promueve a ARRENDADOR si era ESTUDIANTE. Retorna el rol final o None.

    v13.2: delega en role_lifecycle (row-lock); NO hace commit (lo hace el
    endpoint dueño de la transacción).
    """
    try:
        from app.services import role_lifecycle as _rl
        return await _rl.promover_si_estudiante(db, usuario_id)
    except Exception:
        return None


@router.post("/promover", summary="Promover mi cuenta a ARRENDADOR (desde ESTUDIANTE)")
async def promoverme(user: dict = Depends(get_current_user),
                     db: AsyncSession = Depends(get_session)):
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    rol = await promover_a_arrendador(db, uid)
    if rol is not None:
        # v13.2: el helper ya no hace commit (lo hace el dueño de la txn).
        try:
            await db.commit()
        except Exception:
            pass
    if rol is None:
        if not _mock_enabled():
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        for em, m in MOCK_USERS.items():
            if m.get("id") == uid and m.get("rol") == "ESTUDIANTE":
                m["rol"] = "ARRENDADOR"
                rol = "ARRENDADOR"
                break
        rol = rol or user.get("rol")
    return {"rol": rol, "mensaje": "Cuenta promovida a ARRENDADOR." if rol == "ARRENDADOR" else "Sin cambios."}


# ---------------------------------------------------------------------------
# v13: sesiones activas + revocación global ("cerrar en todos los dispositivos")
# ---------------------------------------------------------------------------
@router.get("/sesiones", response_model=list[SesionOut], summary="Listar sesiones activas")
async def listar_sesiones(user: dict = Depends(get_current_user),
                          db: AsyncSession = Depends(get_session)):
    uid = user.get("id")
    actual_jti = user.get("jti")
    try:
        from ..models import Sesion
        res = await db.execute(
            select(Sesion).where(Sesion.usuario_id == uid,
                                 Sesion.revocado.is_(False)).order_by(Sesion.id.desc()))
        out = []
        for s in res.scalars().all():
            out.append(SesionOut(
                jti=s.jti, ip=s.ip,
                creado_en=s.creado_en.isoformat() if s.creado_en else None,
                actual=bool(actual_jti and s.jti == actual_jti),
            ))
        return out
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        return [SesionOut(jti=str(actual_jti or "mock"), ip="127.0.0.1", actual=True)]


@router.post("/sesiones/revocar-todas", summary="Cerrar sesión en todos los dispositivos")
async def revocar_sesiones(user: dict = Depends(get_current_user),
                           db: AsyncSession = Depends(get_session)):
    uid = user.get("id")
    try:
        from ..models import Sesion
        res = await db.execute(
            select(Sesion).where(Sesion.usuario_id == uid, Sesion.revocado.is_(False)))
        n = 0
        for s in res.scalars().all():
            s.revocado = True
            s.revocado_en = datetime.now(timezone.utc)
            n += 1
        await db.commit()
        return {"mensaje": f"Sesiones revocadas: {n}. Vuelve a iniciar sesión.", "revocadas": n}
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[sesiones revocar] DB falló: {e!r}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        return {"mensaje": "Sesiones revocadas (mock).", "revocadas": 1}


# ---------------------------------------------------------------------------
# v13.1: eliminar cuenta (soft-delete 30 días) + restaurar + purga.
# ---------------------------------------------------------------------------
@router.delete("/cuenta", summary="Eliminar mi cuenta (soft-delete 30 días)")
async def eliminar_cuenta(data: CuentaEliminarIn,
                          user: dict = Depends(get_current_user),
                          db: AsyncSession = Depends(get_session)):
    """Borrado con doble confirmación y período de gracia recuperable.

    - Cuentas `password`: exige la contraseña actual.
    - Cuentas solo-Google (sin contraseña conocida): basta el email escrito.
    Efecto: eliminado_en=ahora + sesiones revocadas. Purga física a los
    30 días (login/register la ejecutan si la gracia venció + endpoint admin).
    """
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    if _norm_email(data.confirm_email) != _norm_email(user.get("sub") or ""):
        raise HTTPException(status_code=422, detail="El correo de confirmación no coincide")
    try:
        from ..models import Usuario
        u = await db.get(Usuario, uid)
        if not u:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        prov = getattr(u, "auth_provider", "password") or "password"
        if prov == "password":
            if not data.password or not verify_password(data.password, u.password_hash):
                raise HTTPException(status_code=403, detail="Contraseña incorrecta")
        u.eliminado_en = datetime.now(timezone.utc)
        await _revocar_sesiones_usuario(db, u.id)
        await db.commit()
        return {"mensaje": (f"Cuenta marcada para eliminación. Tienes {CUENTA_GRACE_DAYS} días "
                            "para recuperarla en /api/auth/cuenta/restaurar."),
                "gracia_dias": CUENTA_GRACE_DAYS}
    except HTTPException:
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[cuenta eliminar] DB falló: {e!r}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        for em, m in MOCK_USERS.items():
            if m.get("id") == uid:
                if (m.get("auth_provider", "password") == "password"
                        and (not data.password or not verify_password(data.password, m["password"]))):
                    raise HTTPException(status_code=403, detail="Contraseña incorrecta")
                m["eliminado_en"] = datetime.now(timezone.utc).isoformat()
                break
        return {"mensaje": "Cuenta marcada para eliminación (mock).",
                "gracia_dias": CUENTA_GRACE_DAYS}


@router.post("/cuenta/restaurar", response_model=LoginOut, summary="Restaurar cuenta en gracia")
async def restaurar_cuenta(data: CuentaRestaurarIn, request: Request,
                           db: AsyncSession = Depends(get_session)):
    """Revive una cuenta eliminada dentro de los 30 días (emite sesión nueva)."""
    email = _norm_email(data.email)
    try:
        from ..models import Usuario
        res = await db.execute(select(Usuario).where(Usuario.email == email))
        u = res.scalars().first()
        if not u:
            raise HTTPException(status_code=404, detail="Cuenta no encontrada")
        restan = _gracia_restante(u)
        if restan is None:
            raise HTTPException(status_code=409, detail="La cuenta está activa, inicia sesión normal")
        if restan < 0:
            try:
                await _purge_user(db, u)
            except Exception:
                pass
            raise HTTPException(status_code=410, detail="Gracia vencida: la cuenta fue purgada")
        if not verify_password(data.password, u.password_hash):
            raise HTTPException(status_code=401, detail="Credenciales inválidas")
        u.eliminado_en = None
        await db.commit()
        token = _issue_token(u.id, u.email, u.rol, bool(u.telefono_verificado),
                             bool(getattr(u, "email_verificado", False)))
        try:
            import jwt as _jwt
            jti = _jwt.decode(token, options={"verify_signature": False}).get("jti", "")
            await _registrar_sesion(db, u.id, jti, request)
        except Exception:
            pass
        return {"access_token": token, "token_type": "bearer",
                "expires_in_hours": 8, "rol": u.rol, "mock": False}
    except HTTPException:
        raise
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error(f"[cuenta restaurar] DB falló: {e!r}", exc_info=True)
        if not _mock_enabled():
            raise HTTPException(status_code=503, detail="Base de datos no disponible")
        m = MOCK_USERS.get(email)
        if not m or not m.get("eliminado_en"):
            raise HTTPException(status_code=404, detail="Cuenta no encontrada")
        if not verify_password(data.password, m["password"]):
            raise HTTPException(status_code=401, detail="Credenciales inválidas")
        m.pop("eliminado_en", None)
        token = _issue_token(m["id"], email, m["rol"], False, True)
        return {"access_token": token, "token_type": "bearer",
                "expires_in_hours": 8, "rol": m["rol"], "mock": True}
