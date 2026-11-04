"""Modelos SQLAlchemy de AlojaU, divididos por dominio; este módulo los reexporta todos
(el código importa `from app.models import X`)."""
from app.models.base import (  # noqa: F401
    Base,
)
from app.models.catalogos import (  # noqa: F401
    CampusUniversitario,
    Ciudad,
    HousingType,
    ServicioCatalogo,
    ZonaBarrio,
)
from app.models.preferencias import (  # noqa: F401
    CLAVES_PREFERENCIAS,
    EstabilidadIngresos,
    EstiloCocina,
    FuenteIngresos,
    HorarioAseo,
    MomentoAseoSemana,
    Preferencias,
    RasgoNegativo,
    RasgoPositivo,
    TiempoLavarLoza,
    TipoHorarioSueno,
    _ALIAS_ENUM_LEGACY,
    _coerce_bool3,
    _coerce_enum,
    _coerce_hora,
    _coerce_lista_enum,
    _hora_a_str,
)
from app.models.usuarios import (  # noqa: F401
    OtpCode,
    PasswordReset,
    RateLimitAttempt,
    Sesion,
    Usuario,
)
from app.models.avisos import (  # noqa: F401
    IdempotencyKey,
    ImagenPublicacion,
    Publicacion,
    PublicacionCampus,
    PublicacionServicio,
    PublicacionesAudit,
    ReportePublicacion,
    VistaDedup,
)
from app.models.sistema import (  # noqa: F401
    SystemSetting,
)
from app.models.notificaciones import (  # noqa: F401
    BusquedaGuardada,
    Notificacion,
    TelegramVinculo,
)
from app.models.publicidad import (  # noqa: F401
    PlanPublicidad,
    PublicacionDestacado,
)
