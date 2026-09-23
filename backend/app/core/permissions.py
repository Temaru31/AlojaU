"""v13 Enterprise RBAC: matriz granular de permisos (scopes), no roles rígidos.

Diseño:
- Los endpoints exigen SCOPES (p.ej. "publications:write"), nunca comparan
  strings de rol directamente (salvo compat legacy en security.py).
- ROLE_SCOPES mapea rol -> set(scopes). Agregar un rol nuevo
  (MODERADOR_CAMPUS, AUDITOR_LEGAL, ...) es solo añadir una entrada al dict
  + migración del CHECK de BD. Ningún endpoint cambia.
- La jerarquía es por inclusión: ARRENDADOR incluye todo ESTUDIANTE,
  ADMIN incluye todo lo anterior.

Pre-mortem (Fase 0, documentado aquí para auditoría):
1. Si Supabase/Render se interrumpe: AuthService cae a JWT local HS256
   (fail-closed 503 solo si la BD es indispensable; lectura pública sigue
   con mocks en dev, 503 explícito en prod). El cliente reintenta con
   exponential backoff (ver frontend/src/services/api.js) y muestra
   "Iniciando servidores seguros de AlojaU...".
2. Google con email ya registrado manual: identity linking por email
   normalizado (lower+trim). Si el proveedor difiere se fusiona la fila
   (auth_provider pasa a 'google+password' o 'google'), nunca se duplica.
   Condición de carrera: UNIQUE(email) + transacción + catch IntegrityError
   -> re-lee la fila existente y vincula.
3. Escalar roles sin romper BD: CHECK aditivo en migración
   (incluye ESTUDIANTE + futuros MODERADOR_CAMPUS/AUDITOR_LEGAL desde el
   día 1 en el modelo), ROLE_SCOPES es dict extensible, y require_scope()
   valida contra la matriz, no contra el CHECK. Un rol desconocido recibe
   set() vacío (deny-by-default) en vez de 500.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException

# ---------------------------------------------------------------------------
# Catálogo de scopes (estable; añadir nuevos es aditivo y no rompe nada)
# ---------------------------------------------------------------------------
SCOPE_CATALOG: tuple[str, ...] = (
    "publications:read",
    "favorites:manage",
    "reviews:create",
    "contact:landlord",
    "publications:write",
    "publications:delete_own",
    "analytics:view_own",
    "admin:dashboard:view",
    "admin:reports:moderate",
    "system:settings:write",
    "users:manage",
    # Futuros (reservados, ya mapeables sin migración de código):
    "campus:moderate",
    "legal:audit:view",
)

_ESTUDIANTE_SCOPES = frozenset({
    "publications:read",
    "favorites:manage",
    "reviews:create",
    "contact:landlord",
})

_ARRENDADOR_SCOPES = frozenset(set(_ESTUDIANTE_SCOPES) | {
    "publications:write",
    "publications:delete_own",
    "analytics:view_own",
})

_ADMIN_SCOPES = frozenset(set(_ARRENDADOR_SCOPES) | {
    "admin:dashboard:view",
    "admin:reports:moderate",
    "system:settings:write",
    "users:manage",
})

# Roles futuros ya contemplados (extensibles sin tocar endpoints):
_FUTURE_ROLE_SCOPES: dict[str, frozenset] = {
    "MODERADOR_CAMPUS": frozenset(set(_ESTUDIANTE_SCOPES) | {
        "admin:reports:moderate",
        "campus:moderate",
    }),
    "AUDITOR_LEGAL": frozenset({
        "publications:read",
        "legal:audit:view",
        "admin:dashboard:view",
    }),
}

ROLE_SCOPES: dict[str, frozenset] = {
    "ESTUDIANTE": _ESTUDIANTE_SCOPES,
    "ARRENDADOR": _ARRENDADOR_SCOPES,
    "ADMIN": _ADMIN_SCOPES,
    **_FUTURE_ROLE_SCOPES,
}

# Roles que la BD acepta (CHECK aditivo; el modelo lo refleja).
VALID_ROLES: tuple[str, ...] = (
    "ESTUDIANTE", "ARRENDADOR", "ADMIN", "MODERADOR_CAMPUS", "AUDITOR_LEGAL",
)


def scopes_for_role(rol: str | None) -> frozenset:
    """Scopes de un rol. Rol desconocido/ausente -> vacío (deny-by-default)."""
    if not rol:
        return frozenset()
    return ROLE_SCOPES.get(str(rol).upper(), frozenset())


def user_scopes(user: dict | None) -> frozenset:
    """Scopes efectivos de un payload JWT.

    Precedencia: 1) claim explícito "scopes" (tokens nuevos),
    2) derivación por rol (tokens legacy HS256 sin claim).
    El claim explícito NUNCA puede ampliar lo que el rol permite:
    se intersecta con la matriz (mitiga manipulación del payload JWT).
    """
    if not user:
        return frozenset()
    rol = user.get("rol")
    base = scopes_for_role(rol)
    claimed = user.get("scopes")
    if not claimed:
        return base
    try:
        claimed_set = {str(s) for s in claimed if isinstance(s, str)}
    except Exception:
        return base
    # Intersección: el token no puede auto-otorgarse scopes fuera de su rol.
    valid = {s for s in claimed_set if s in SCOPE_CATALOG}
    return frozenset(valid & set(base))


def has_scope(user: dict | None, scope: str) -> bool:
    return scope in user_scopes(user)


def require_scope(scope: str):
    """Dependencia FastAPI: exige un scope o 403 (401 sin token lo da security)."""
    from app.core.security import get_current_user  # import tardío: evita ciclo

    async def _dep(user: dict = Depends(get_current_user)) -> dict:
        if not has_scope(user, scope):
            raise HTTPException(
                status_code=403,
                detail=f"Permiso insuficiente: se requiere '{scope}'",
            )
        return user

    return _dep


def require_any_scope(*scopes: str):
    """Dependencia: exige al menos uno de los scopes."""
    from app.core.security import get_current_user

    async def _dep(user: dict = Depends(get_current_user)) -> dict:
        actual = user_scopes(user)
        if not any(s in actual for s in scopes):
            raise HTTPException(
                status_code=403,
                detail=f"Permiso insuficiente: se requiere uno de {list(scopes)}",
            )
        return user

    return _dep


def register_role(rol: str, scopes: set[str]) -> None:
    """Extensión en caliente para futuros roles sin tocar endpoints.

    Ej: register_role("MODERADOR_CAMPUS", {"publications:read", ...}).
    Solo acepta scopes del catálogo (fail-fast ante typos).
    """
    desconocidos = set(scopes) - set(SCOPE_CATALOG)
    if desconocidos:
        raise ValueError(f"Scopes desconocidos: {sorted(desconocidos)}")
    ROLE_SCOPES[str(rol).upper()] = frozenset(scopes)
