"""Consultas SQL AlojaU (capa repositorio, sin HTTP ni DTOs).
Uso: routers/publicaciones.py. Ej: total, pubs = await repo.query_lista(db, ...).

Paquete por dominio; este módulo reexporta todos los modelos
(los llamadores usan `app.repositories.publicacion_repo.X`)."""
from app.repositories.publicacion_repo.texto import (  # noqa: F401
    Q_MIN_FTS_LEN,
    Q_TRGM_SIMILARITY,
    _texto_busqueda,
    _token_match_or,
    fts_condition,
    fuzzy_condition,
    resolver_modo_q,
    tokens_or_condition,
    tokens_relevance,
    ts_rank_order,
)
from app.repositories.publicacion_repo.ajustes import vistas_publicas  # noqa: F401
from app.repositories.publicacion_repo.lista import (  # noqa: F401
    count_total,
    destacados_vigentes_subq,
    dueno_activo_clause,
    fetch_destacados_map,
    fetch_page,
    fetch_page_aggregates,
    lista_conditions,
    query_lista,
    resolver_ciudad_id,
    select_con_relaciones,
)
from app.repositories.publicacion_repo.detalle import (  # noqa: F401
    fetch_detail_bundle,
    fetch_detail_campus_ref,
    fotos_de_aviso,
)
from app.repositories.publicacion_repo.escritura import (  # noqa: F401
    create_persisted,
    renovar_publicacion,
    validate_fks,
)
