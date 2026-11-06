"""Seguridad: contraseñas, JWT, claims y guards de FastAPI (fail-closed: sin BD -> 503).

Uso: Depends(get_current_user/require_arrendador/require_admin) en routers.
Ej: headers {"Authorization": "Bearer <jwt>"} -> {"id":1,"rol":"ARRENDADOR"}.
Los tokens incluyen `jti` (revocación) y `scopes` (RBAC); los legacy sin scopes
se enriquecen por rol. `get_current_user` verifica la revocación en TODOS los
endpoints autenticados (exentos: tokens de prueba en dev y tokens sin jti).

Paquete por responsabilidad; este módulo reexporta todo
(los llamadores usan `app.core.security.X`):
- claims: `ClaimsUsuario`, `id_propietario`, `id_o_none`.
- passwords: hash/verificación bcrypt.
- tokens: emisión/decodificación JWT y tokens de prueba.
- guards: dependencias de autenticación/autorización y cachés de rol."""
from app.core.security.claims import (  # noqa: F401
    ClaimsUsuario,
    id_o_none,
    id_propietario,
)
from app.core.security.passwords import (  # noqa: F401
    _pw_bytes,
    hash_password,
    verify_password,
)
from app.core.security.tokens import (  # noqa: F401
    MOCK_TOKENS,
    create_token,
    decode_token,
)
from app.core.security.guards import (  # noqa: F401
    _ADMIN_REVALID_MEM,
    _ADMIN_REVALID_TTL_S,
    _ROL_CACHE,
    _ROL_CACHE_TTL_S,
    _es_arrendador_real,
    _rol_en_bd,
    _rol_no_verificable,
    _sesion,
    _verificar_sesion_activa,
    clear_admin_revalid_for_tests,
    clear_rol_cache_for_tests,
    es_dueno_o_admin,
    get_current_admin_user,
    get_current_user,
    get_optional_user,
    require_admin,
    require_arrendador,
)
