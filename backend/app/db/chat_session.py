"""Conexión SEPARADA de solo lectura para el chatbot (mig 021, rol chatbot_ro).

El chatbot NUNCA usa la sesión principal (`app.db.session`): toda lectura del
bot sale por este engine, autenticado como `chatbot_ro`, un rol que solo tiene
SELECT sobre las vistas `chat_v_*` (con `default_transaction_read_only = on`,
`statement_timeout = 3s` y CONNECTION LIMIT bajo a nivel de rol).

Fail-closed: sin CHAT_DATABASE_URL (o con CHAT_ENABLED=false) no hay engine y
`get_chat_session` responde 503 "Asistente no disponible". JAMÁS se cae a
DATABASE_URL principal.

Supabase pooler: el usuario lleva sufijo .<project-ref>, p. ej.
  CHAT_DATABASE_URL=postgresql+asyncpg://chatbot_ro.<ref>:<secreto>
    @aws-0-us-east-2.pooler.supabase.com:5432/postgres
"""
import os
import sys
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool

_ESQUEMAS_PG = ("postgresql", "postgresql+asyncpg")


def _normalizar_dsn_chat(dsn: str) -> str:
    """Valida esquema/host y añade ssl=require solo a Supabase real.

    Réplica mínima de la normalización principal, autocontenida a propósito:
    este módulo no importa `app.db.session` (el chatbot no toca la sesión
    principal ni siquiera por importación).
    """
    partes = urlsplit(str(dsn or ""))
    if partes.scheme not in _ESQUEMAS_PG or not partes.hostname:
        raise ValueError("CHAT_DATABASE_URL inválida: esquema postgres requerido")
    esquema = "postgresql+asyncpg" if partes.scheme == "postgresql" else partes.scheme
    host = (partes.hostname or "").lower()
    params = [(k, v) for k, v in parse_qsl(partes.query, keep_blank_values=True)]
    nombres = {k.lower() for k, _ in params}
    es_supabase = host in ("supabase.co", "supabase.com") or host.endswith(
        (".supabase.co", ".supabase.com"))
    if es_supabase and "ssl" not in nombres:
        params.append(("ssl", "require"))
    return urlunsplit((esquema, partes.netloc, partes.path,
                       urlencode(params), partes.fragment))


def _dsn_chat() -> str:
    return (os.getenv("CHAT_DATABASE_URL") or "").strip()


def chat_configurado() -> bool:
    """True si hay DSN de solo lectura válido (no garantiza rol/tablas)."""
    dsn = _dsn_chat()
    if not dsn:
        return False
    try:
        _normalizar_dsn_chat(dsn)
        return True
    except ValueError:
        return False


def _crear_engine():
    if not chat_configurado():
        return None
    # Tráfico bajo del bot: pool mínimo. NullPool bajo pytest (mismo motivo
    # que la sesión principal: loops distintos por TestClient).
    kwargs = (
        {"poolclass": NullPool}
        if "pytest" in sys.modules
        else {"pool_size": 2, "max_overflow": 3,
              "pool_pre_ping": True, "pool_recycle": 300}
    )
    return create_async_engine(
        _normalizar_dsn_chat(_dsn_chat()),
        echo=False,
        connect_args={"statement_cache_size": 0,
                      "prepared_statement_cache_size": 0},
        **kwargs,
    )


chat_engine = _crear_engine()
ChatSession = (
    async_sessionmaker(chat_engine, expire_on_commit=False)
    if chat_engine is not None else None
)


def clear_chat_engine_for_tests() -> None:
    """Relee CHAT_DATABASE_URL (tests que cambian env con monkeypatch)."""
    global chat_engine, ChatSession
    chat_engine = _crear_engine()
    ChatSession = (
        async_sessionmaker(chat_engine, expire_on_commit=False)
        if chat_engine is not None else None
    )


async def get_chat_session():
    """Dependencia FastAPI: sesión del rol chatbot_ro o 503 fail-closed."""
    if ChatSession is None:
        raise HTTPException(
            status_code=503, detail="Asistente no disponible")
    async with ChatSession() as sesion:
        yield sesion
