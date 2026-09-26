"""v13 AuthService: abstracción de identidad desacoplada del proveedor.

Clean Architecture: el resto de la app (routers) habla con AuthService,
nunca con SDKs de Supabase directamente. Cambiar de proveedor (Auth0,
Cognito, Firebase...) = implementar esta interfaz, sin tocar routers.

Proveedores incluidos:
- LocalAuthService: JWT HS256 propio (dev + fallback resiliente).
- SupabaseAuthService: valida JWT RS256 de Supabase vía JWKS
  (firma + iss + aud + exp). Solo se activa si hay SUPABASE_URL/JWKS
  configurado; si la JWKS no responde (cold start / caída), hace
  fail-closed 401 con mensaje claro y deja que el cliente reintente.

Pre-mortem (ver también permissions.py):
- Supabase caído -> SupabaseAuthService falla cerrado (401/503), el
  LocalAuthService sigue validando tokens locales; la lectura pública
  no se bloquea.
- Render dormido (15-45s) -> el frontend muestra loader explícito y
  reintenta con backoff; el backend usa pool_pre_ping + NullPool en tests.
"""
from __future__ import annotations

import time
from abc import ABC, abstractmethod
from typing import Any

import jwt as pyjwt

from app.core.config import settings


class AuthService(ABC):
    """Interfaz de identidad. Todo router depende de esto, no de SDKs."""

    @abstractmethod
    def create_token(self, data: dict) -> str:
        ...

    @abstractmethod
    def decode_token(self, token: str) -> dict:
        ...

    @abstractmethod
    def normalize_email(self, email: str) -> str:
        ...


class LocalAuthService(AuthService):
    """Proveedor local HS256 (cero dependencias externas, free-tier forever)."""

    def create_token(self, data: dict) -> str:
        from app.core.security import create_token as _create

        return _create(data)

    def decode_token(self, token: str) -> dict:
        from app.core.security import decode_token as _decode

        return _decode(token)

    def normalize_email(self, email: str) -> str:
        return str(email or "").strip().lower()


# --- Caché en memoria del JWKS (evita 1 fetch por request en free tier) ---
_JWKS_CACHE: dict[str, Any] = {"keys": None, "ts": 0.0}
_JWKS_TTL_S = 600.0


def _fetch_jwks(jwks_url: str) -> dict:
    """Descarga JWKS con caché TTL 10min. Lanza RuntimeError si no responde."""
    import urllib.request
    import json

    now = time.monotonic()
    if _JWKS_CACHE["keys"] is not None and (now - _JWKS_CACHE["ts"]) < _JWKS_TTL_S:
        return _JWKS_CACHE["keys"]
    try:
        req = urllib.request.Request(jwks_url, headers={"User-Agent": "AlojaU-auth/1.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:  # noqa: S310
            payload = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        raise RuntimeError(f"JWKS no disponible ({jwks_url}): {e!r}") from e
    _JWKS_CACHE["keys"] = payload
    _JWKS_CACHE["ts"] = now
    return payload


def clear_jwks_cache_for_tests() -> None:
    _JWKS_CACHE["keys"] = None
    _JWKS_CACHE["ts"] = 0.0


class SupabaseAuthService(AuthService):
    """Valida JWT emitidos por Supabase Auth (RS256 vía JWKS).

    Verifica: firma (kid del JWKS), iss (SUPABASE_URL/auth/v1),
    aud (SUPABASE_AUD, default "authenticated") y exp.
    """

    def __init__(self, jwks_url: str = "", audience: str = "authenticated",
                 issuer: str = "") -> None:
        self.jwks_url = jwks_url or settings.jwks_url
        self.audience = audience or settings.SUPABASE_AUD
        base = (settings.SUPABASE_URL or "").rstrip("/")
        self.issuer = issuer or (f"{base}/auth/v1" if base else "")

    def create_token(self, data: dict) -> str:
        # Supabase emite sus propios tokens; este proveedor es solo validación.
        # La creación local sigue siendo HS256 para sesiones propias.
        return LocalAuthService().create_token(data)

    def normalize_email(self, email: str) -> str:
        return str(email or "").strip().lower()

    def decode_token(self, token: str) -> dict:
        from fastapi import HTTPException

        if not self.jwks_url:
            raise HTTPException(status_code=503, detail="Proveedor Supabase no configurado")
        try:
            header = pyjwt.get_unverified_header(token)
        except Exception:
            raise HTTPException(status_code=401, detail="Token inválido o expirado")
        kid = header.get("kid")
        if not kid:
            raise HTTPException(status_code=401, detail="Token inválido o expirado")
        try:
            jwks = _fetch_jwks(self.jwks_url)
        except RuntimeError:
            # Cold-start / caída del proveedor: fail-closed pero con mensaje
            # que el cliente puede mostrar y reintentar (no 500 opaco).
            raise HTTPException(
                status_code=503,
                detail="Proveedor de identidad no disponible, reintenta en unos segundos",
            )
        key = None
        for k in jwks.get("keys", []):
            if k.get("kid") == kid:
                key = pyjwt.algorithms.RSAAlgorithm.from_jwk(k)
                break
        if key is None:
            raise HTTPException(status_code=401, detail="Token inválido o expirado")
        try:
            kwargs: dict[str, Any] = {"algorithms": ["RS256"], "options": {"require": ["exp", "sub"]}}
            if self.audience:
                kwargs["audience"] = self.audience
            if self.issuer:
                kwargs["issuer"] = self.issuer
            return pyjwt.decode(token, key, **kwargs)
        except pyjwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token inválido o expirado")
        except pyjwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Token inválido o expirado")


def get_auth_service() -> AuthService:
    """Factoría: Supabase si está configurado, local en caso contrario.

    Nunca lanza: si Supabase está a medias, devuelve local (resiliencia).
    """
    try:
        if settings.supabase_configured and settings.jwks_url:
            return SupabaseAuthService()
    except Exception:
        pass
    return LocalAuthService()


def decode_token_provider_agnostic(token: str) -> dict:
    """Decodifica intentando Supabase primero (si configurado) y luego local.

    Permite convivencia de sesiones durante la migración de proveedor.
    """
    from fastapi import HTTPException

    svc = get_auth_service()
    if isinstance(svc, SupabaseAuthService):
        try:
            return svc.decode_token(token)
        except HTTPException as e:
            if e.status_code == 503:
                raise
            # Token no-Supabase (p.ej. sesión local legacy): fallback local.
            from app.core.security import decode_token as _local_decode

            return _local_decode(token)
    return svc.decode_token(token)
