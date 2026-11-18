"""Normalización y comparación de texto del chatbot (puro, sin E/S).

NFKC unifica ancho completo y caracteres de compatibilidad; se eliminan los
caracteres de formato (por ejemplo zero-width) y de control para que no
evadan las reglas. Las comparaciones internas usan `plano`: minúsculas, sin
tildes ni signos.
"""
import re
import unicodedata

from app.services.search import STOP_WORDS_ES

_RE_ESPACIOS = re.compile(r"\s+")
_RE_NO_ALFANUM = re.compile(r"[^a-z0-9]+")

# Ruido de cortesía/pregunta que no orienta el seguimiento ni la recuperación.
_NO_SIGNIFICATIVAS = frozenset({
    "hola", "buenas", "gracias", "ayuda", "ayudame", "favor", "porfa",
    "como", "que", "para", "sirve", "hace", "funciona", "puedo", "quiero",
    "donde", "cual", "cuales", "dime", "explica", "app", "aplicacion",
    "plataforma", "alojau", "hay", "necesito", "saber", "sobre", "dame",
})


def normalizar(texto: str) -> str:
    """NFKC, sin caracteres de formato/control y con espacios colapsados."""
    base = unicodedata.normalize("NFKC", str(texto or ""))
    limpio: list[str] = []
    for caracter in base:
        categoria = unicodedata.category(caracter)
        if categoria == "Cf":
            continue  # zero-width, marcas de dirección y similares
        if categoria == "Cc" and caracter not in "\n\t":
            continue
        limpio.append(" " if caracter in "\n\t" else caracter)
    return _RE_ESPACIOS.sub(" ", "".join(limpio)).strip()


def plano(texto: str) -> str:
    """Minúsculas sin tildes ni signos: solo para reglas y comparaciones."""
    base = unicodedata.normalize("NFD", normalizar(texto).lower())
    sin_tildes = "".join(c for c in base if unicodedata.category(c) != "Mn")
    return _RE_ESPACIOS.sub(" ", _RE_NO_ALFANUM.sub(" ", sin_tildes)).strip()


def palabras_significativas(texto: str) -> list[str]:
    """Palabras útiles de la consulta, sin vacías ni ruido de pregunta."""
    return [p for p in plano(texto).split()
            if len(p) >= 3 and p not in STOP_WORDS_ES
            and p not in _NO_SIGNIFICATIVAS]
