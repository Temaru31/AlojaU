"""Motor de búsqueda inteligente tokenizada (Fase 2).

Uso: repositories/publicacion_repo.py y services/publicacion_view.py.
Ej: tokens = tokenize_query("Apartamento amoblado con closet en el centro")
    -> ["apartamento", "amoblado", "closet", "centro"]

Diseño:
- Tokenización simple por regex alfanumérico + minúsculas + strip de tildes
  solo para comparar (la columna original se consulta con ILIKE).
- Stop-words en español filtradas (artículos, preposiciones, etc.).
- Sanitización ILIKE: escapa ``\\``, ``%`` y ``_`` con ESCAPE '\\'.
- Sinónimos tipo_vivienda para que "apartamento" matchee APARTAESTUDIO, etc.
"""

import re
import unicodedata

# Stop-words español: artículos, preposiciones, conjunciones comunes.
# Alineado al prompt: "con", "de", "en", "el", "la", "un", "para" + extensión mínima.
STOP_WORDS_ES = frozenset({
    "a", "al", "ante", "bajo", "con", "contra", "de", "del", "desde",
    "durante", "en", "entre", "hacia", "hasta", "mediante", "para",
    "por", "segun", "según", "sin", "sobre", "tras",
    "el", "la", "los", "las", "un", "una", "unos", "unas",
    "lo", "le", "les", "se", "que", "como", "cómo", "donde", "dónde",
    "cuando", "cuándo", "cual", "cuál", "cuales", "cuáles",
    "y", "e", "ni", "o", "u", "pero", "sino", "porque", "pues",
    "si", "no", "muy", "mas", "más", "menos", "tan", "tanto",
    "mi", "mis", "tu", "tus", "su", "sus", "este", "esta", "estos",
    "estas", "ese", "esa", "esos", "esas", "esto", "eso",
    "hay", "estoy", "esta", "estan", "están", "es", "son",
    "quiero", "busco", "necesito", "cerca", "alrededor",
})

MAX_TOKENS = 10
MIN_TOKEN_LEN = 2

# Sinónimos -> tipo_inmueble canónico (para que "apartamento" encuentre APARTAESTUDIO).
# M2 aditivo: se añaden "completo/entero" -> APARTAMENTO_COMPLETO y
# "piso" -> HABITACION_PISO_COMPARTIDO. Los existentes NO cambian
# (apartamento sigue a APARTAESTUDIO por retrocompatibilidad).
TIPO_SINONIMOS = {
    "apartamento": "APARTAESTUDIO",
    "apartamentos": "APARTAESTUDIO",
    "apartaestudio": "APARTAESTUDIO",
    "apartaestudios": "APARTAESTUDIO",
    "aparta": "APARTAESTUDIO",
    "estudio": "APARTAESTUDIO",
    "monoambiente": "APARTAESTUDIO",
    "habitacion": "HABITACION",
    "habitación": "HABITACION",
    "habitaciones": "HABITACION",
    "cuarto": "HABITACION",
    "cuartos": "HABITACION",
    "pieza": "HABITACION",
    "alcoba": "HABITACION",
    "familiar": "HABITACION_FAMILIAR",
    "independiente": "HABITACION_INDEPENDIENTE",
    "privada": "HABITACION_INDEPENDIENTE",
    "privado": "HABITACION_INDEPENDIENTE",
    "compartido": "COMPARTIDO",
    "compartida": "COMPARTIDO",
    "compartir": "COMPARTIDO",
    # M2 nuevos tipos dinámicos (aditivos):
    "completo": "APARTAMENTO_COMPLETO",
    "completos": "APARTAMENTO_COMPLETO",
    "entero": "APARTAMENTO_COMPLETO",
    "entera": "APARTAMENTO_COMPLETO",
    "piso": "HABITACION_PISO_COMPARTIDO",
}

_TOKEN_RE = re.compile(r"[a-z0-9ñü]+", re.IGNORECASE)


def _strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def normalize_token(s: str) -> str:
    """Minúsculas sin tildes para comparar stop-words y sinónimos."""
    return _strip_accents(s.lower().strip())


def escape_ilike(s: str) -> str:
    """Escapa \\, % y _ para uso seguro en ILIKE ... ESCAPE '\\'."""
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def tokenize_query(q: str | None, max_tokens: int = MAX_TOKENS) -> list[str]:
    """Divide ``q`` en tokens significativos.

    - Minúsculas, regex alfanumérico (corta % _ " ' safely).
    - Filtra stop-words ES y tokens de 1 char (ruido).
    - Dedup preservando orden, tope ``max_tokens``.
    - Retorna [] si no hay nada significativo (el caller trata como sin filtro).
    """
    if not q or not isinstance(q, str):
        return []
    raw = _TOKEN_RE.findall(q.lower())
    out: list[str] = []
    seen: set[str] = set()
    for tok in raw:
        norm = normalize_token(tok)
        if not norm or len(norm) < MIN_TOKEN_LEN:
            continue
        if norm in STOP_WORDS_ES:
            continue
        # Clave dedup sin tildes; valor original en minúsculas para ILIKE.
        key = norm
        val = tok.strip()
        if key in seen:
            continue
        seen.add(key)
        out.append(val)
        if len(out) >= max_tokens:
            break
    return out


def clean_query_for_fts(tokens: list[str]) -> str:
    """Une tokens para websearch_to_tsquery (ya sin stop-words ni símbolos)."""
    return " ".join(tokens)


def tipo_canonico_para_token(token: str) -> str | None:
    """Mapea un token a un tipo_inmueble canónico o prefijo HABITACION."""
    norm = normalize_token(token)
    return TIPO_SINONIMOS.get(norm)
