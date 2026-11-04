"""Búsqueda por texto: FTS en español, coincidencia por tokens y similitud difusa."""
from typing import List, Optional
from sqlalchemy import case, func, or_
from app.services.search import escape_ilike, tipo_canonico_para_token, tokenize_query


# Umbrales de búsqueda por texto (alineados al prompt táctico).
Q_MIN_FTS_LEN = 3  # q más corta -> solo fallback difuso (ILIKE/trigrama)
Q_TRGM_SIMILARITY = 0.3


def _texto_busqueda(Publicacion):
    """Expresión titulo + descripcion para FTS (ambas NOT NULL en el modelo)."""
    return Publicacion.titulo + " " + Publicacion.descripcion


def fts_condition(Publicacion, q: str):
    """Coincidencia Full-Text español (usa idx_publicaciones_fts).

    ``q`` debe venir ya limpio (tokens sin stop-words ni símbolos) vía
    clean_query_for_fts(); websearch_to_tsquery es tolerante pero así se
    evitan fallos de sintaxis con %, _, comillas, etc.
    """
    return func.to_tsvector("spanish", _texto_busqueda(Publicacion)).op("@@")(
        func.websearch_to_tsquery("spanish", q)
    )


def _token_match_or(Publicacion, token: str):
    """OR de un token sobre titulo, descripcion, zona, tipo y servicios.

    Invariante: no toca el filtro de POIs (campus_id se ANDea aparte).
    Sanitiza ILIKE escapando % _ \\ y usa unaccent para "habitacion"→"habitación".
    """
    from app.models import ServicioCatalogo, ZonaBarrio

    esc = escape_ilike(token)
    pat = f"%{esc}%"
    conds = [
        func.unaccent(Publicacion.titulo).ilike(pat, escape="\\"),
        func.unaccent(Publicacion.descripcion).ilike(pat, escape="\\"),
        Publicacion.zona.has(func.unaccent(ZonaBarrio.nombre).ilike(pat, escape="\\")),
        Publicacion.servicios.any(func.unaccent(ServicioCatalogo.nombre).ilike(pat, escape="\\")),
    ]
    canon = tipo_canonico_para_token(token)
    if canon == "HABITACION":
        conds.append(Publicacion.tipo_inmueble.like("HABITACION%"))
    elif canon:
        conds.append(Publicacion.tipo_inmueble == canon)
    else:
        conds.append(Publicacion.tipo_inmueble.ilike(pat, escape="\\"))
    return or_(*conds)


def tokens_or_condition(Publicacion, tokens: List[str]):
    """Al menos 1 token coincide (OR) — incluye parciales a propósito."""
    return or_(*[_token_match_or(Publicacion, t) for t in tokens])


def tokens_relevance(Publicacion, tokens: List[str]):
    """Score = nº de tokens que matchean (para ordenar mayoría primero)."""
    return sum(
        (case((_token_match_or(Publicacion, t), 1), else_=0) for t in tokens),
        start=0,
    )


def fuzzy_condition(Publicacion, q: str):
    """Fallback tolerante: tokenizado OR + trigramas (usa idx_publicaciones_trgm).

    - Tokeniza y filtra stop-words ES ("apartamento con baño" -> ["apartamento","baño"]).
    - Si no quedan tokens significativos, retorna None (sin filtro de texto).
    - Si hay 1 token corto, conserva trigramas/ILIKE clásico para typos.
    """
    tokens = tokenize_query(q)
    if not tokens:
        return None
    per_token = [_token_match_or(Publicacion, t) for t in tokens]
    # Trigrama solo con el primer token (typos cortos); el resto va por ILIKE tokenizado.
    trigram = func.similarity(Publicacion.titulo, tokens[0]) > Q_TRGM_SIMILARITY
    return or_(trigram, *per_token)


def ts_rank_order(Publicacion, q: str):
    """Relevancia FTS (mayor primero)."""
    return func.ts_rank(
        func.to_tsvector("spanish", _texto_busqueda(Publicacion)),
        func.websearch_to_tsquery("spanish", q),
    ).desc()


def resolver_modo_q(q: Optional[str]) -> Optional[str]:
    """Normaliza q y elige modo: None (sin búsqueda), 'fts' (>=3 chars) o 'fuzzy' (<3)."""
    if q is None:
        return None
    q = q.strip()
    if not q:
        return None
    return "fts" if len(q) >= Q_MIN_FTS_LEN else "fuzzy"
