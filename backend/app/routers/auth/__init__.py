"""Auth enterprise v13: registro Ley 1581, login con rate-limit persistente,
verificación email + OTP, recovery un solo uso, Google OAuth + linking,
sesiones revocables y promoción ESTUDIANTE->ARRENDADOR.

Compatibilidad: conserva todos los endpoints y contratos previos
(/register, /login, /perfil, /perfil/password, solicitud-verificacion).
Los tokens legacy sin scopes/jti siguen válidos (enriquecidos por rol).

Paquete por caso de uso; este módulo solo compone los sub-routers bajo
/api/auth y reexporta los nombres que usan las pruebas."""
from fastapi import APIRouter

from app.core.config import settings  # noqa: F401  (tests: auth_router.settings)
from app.fixtures.usuarios_demo import MOCK_USERS  # noqa: F401
from app.routers.auth.comun import (  # noqa: F401
    digitos_nacionales,
)
from app.routers.auth.esquemas import (  # noqa: F401
    CuentaEliminarIn,
    CuentaRestaurarIn,
    GoogleCallbackIn,
    LoginIn,
    LoginOut,
    OtpSolicitarIn,
    OtpVerificarIn,
    PasswordChangeIn,
    PerfilOut,
    PerfilUpdateIn,
    RecoveryConfirmarIn,
    RecoverySolicitarIn,
    RegisterIn,
    RegisterOut,
    SesionOut,
)
from app.routers.auth.limites import (  # noqa: F401
    _LOGIN_ATTEMPTS,
    _OAUTH_ATTEMPTS,
    _PW_ATTEMPTS,
)
from app.routers.auth.oauth import (  # noqa: F401
    _verificar_jwt_google,
    oauth_google_callback,
)
from app.routers.auth.otp_recuperacion import (  # noqa: F401
    _MOCK_OTPS,
    _MOCK_RESETS,
    _OTP_SOLICITAR,
    _OTP_VERIFICAR,
    _crear_otp,
    otp_solicitar,
    otp_verificar,
    recovery_confirmar,
    recovery_solicitar,
)
from app.routers.auth.perfil import (  # noqa: F401
    _AVATAR_MEM,
    cambiar_password,
    get_perfil,
    solicitar_verificacion,
    update_perfil,
)
from app.routers.auth.registro_login import (  # noqa: F401
    login,
    register,
)
from app.routers.auth.sesiones_cuenta import (  # noqa: F401
    eliminar_cuenta,
    listar_sesiones,
    logout_actual,
    logout_todas,
    promoverme,
    restaurar_cuenta,
)
from app.routers.auth.telegram_vinculo import (  # noqa: F401
    _TELEGRAM_PENDIENTES,
    _TELEGRAM_USADOS,
    _TELEGRAM_VINCULOS,
    _TG_MEM,
    _contacto_coincide,
    _desarmar_token_vinculo,
    _firmar_vinculo,
    validar_token_vinculo,
    validar_token_vinculo_db,
)
from app.routers.auth import oauth, otp_recuperacion, perfil, registro_login, sesiones_cuenta, telegram_vinculo

router = APIRouter(prefix="/api/auth", tags=["auth"])
for _sub in (oauth, otp_recuperacion, perfil, registro_login, sesiones_cuenta, telegram_vinculo):
    router.include_router(_sub.router)
