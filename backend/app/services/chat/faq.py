"""FAQ del chatbot: recuperación por palabras clave sobre kb/*.md.

Sin embeddings ni servicios externos ($0): los documentos son pocos y se
puntúan por solapamiento de tokens (misma tokenización ES de search.py).
Puro y sin E/S en caliente (carga perezosa con caché en memoria).
"""
import pathlib
import re

from app.services.search import tokenize_query

_KB_DIR = pathlib.Path(__file__).resolve().parent / "kb"
_CACHE: dict[str, list[dict]] = {"docs": []}

_FRAGMENTO_MAX = 400


def _cargar() -> list[dict]:
    if _CACHE["docs"]:
        return _CACHE["docs"]
    docs: list[dict] = []
    if _KB_DIR.is_dir():
        for path in sorted(_KB_DIR.glob("*.md")):
            texto = path.read_text(encoding="utf-8")
            titulo = ""
            cuerpo = texto
            m = re.match(r"#\s*(.+)\n", texto)
            if m:
                titulo = m.group(1).strip()
                cuerpo = texto[m.end():].strip()
            docs.append({"doc": path.stem, "titulo": titulo, "texto": cuerpo})
    _CACHE["docs"] = docs
    return docs


def clear_faq_cache_for_tests() -> None:
    _CACHE["docs"] = []


def buscar_en_faq(pregunta: str, tope: int = 3) -> list[dict]:
    """Top-N fragmentos {doc, titulo, fragmento} por solapamiento de tokens."""
    tokens = set(tokenize_query(pregunta))
    if not tokens:
        return []
    scored: list[tuple[int, dict]] = []
    for doc in _cargar():
        cuerpo_tokens = set(tokenize_query(doc["titulo"] + " " + doc["texto"]))
        puntos = len(tokens & cuerpo_tokens)
        # El título pesa doble (orienta al doc correcto).
        puntos += len(set(tokenize_query(doc["titulo"])) & tokens)
        if puntos > 0:
            scored.append((puntos, doc))
    scored.sort(key=lambda p: p[0], reverse=True)
    salida: list[dict] = []
    for _, doc in scored[:max(1, min(int(tope or 3), 3))]:
        salida.append({
            "doc": doc["doc"],
            "titulo": doc["titulo"],
            "fragmento": doc["texto"][:_FRAGMENTO_MAX],
        })
    return salida
