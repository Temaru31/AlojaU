"""Tolerancia a errores de escritura (puro, sin E/S en caliente).

Corrige palabras de 5 o más letras que estén a distancia de edición 1 de una
palabra del vocabulario de AlojaU (documentación + disparadores de temas):
«spublicar» -> «publicar», «confiansa» -> «confianza». La corrección solo se
usa para reconocer el tema y buscar en la documentación; al modelo le llega
el texto original del usuario.

No se tocan cifras, nombres propios (palabras con mayúscula que no abren la
frase) ni palabras comunes que quedan a una letra de un tema y cambiarían el
sentido («comprar» no es «comparar»).
"""
import pathlib
import re

from app.services.chat.normalizar import normalizar, plano

_KB_DIR = pathlib.Path(__file__).resolve().parent / "kb"
_LARGO_MINIMO = 5
_RE_PALABRA_ORIGINAL = re.compile(r"\w+", re.UNICODE)

# Palabras de los disparadores de temas que también deben corregirse aunque
# la documentación las escriba en otra forma.
_VOCABULARIO_EXTRA = (
    "publicar", "publico", "publicacion", "publicaciones", "roomies",
    "confianza", "favoritos", "comparar", "alertas", "contrasena",
    "recuperar", "destacar", "publicitar", "publicidad", "perfil",
    "renovar", "filtros", "busqueda", "buscar", "vivienda", "compatibilidad",
    "notificaciones", "telegram", "indice", "puntaje", "pausar",
)

_NO_CORREGIR = frozenset({
    "comprar", "compra", "compras", "compro", "comprare", "pueda", "puede",
    "puedo", "pueden", "tienes", "tiene", "quiero", "quieres", "estoy",
})

_CACHE: dict[str, frozenset[str]] = {}


def _vocabulario() -> frozenset[str]:
    """Palabras planas de 5+ letras de la KB y de los temas (en caché)."""
    if "vocab" in _CACHE:
        return _CACHE["vocab"]
    palabras: set[str] = set(_VOCABULARIO_EXTRA)
    if _KB_DIR.is_dir():
        for path in sorted(_KB_DIR.glob("*.md")):
            texto = plano(path.read_text(encoding="utf-8"))
            palabras.update(p for p in texto.split()
                            if len(p) >= _LARGO_MINIMO and p.isalpha())
    _CACHE["vocab"] = frozenset(palabras)
    return _CACHE["vocab"]


def clear_vocabulario_for_tests() -> None:
    _CACHE.clear()


def distancia_uno(a: str, b: str) -> bool:
    """True si `a` y `b` difieren en exactamente una edición (Levenshtein)."""
    if a == b or abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) == 1
    corta, larga = (a, b) if len(a) < len(b) else (b, a)
    for i in range(len(larga)):
        if larga[:i] + larga[i + 1:] == corta:
            return True
    return False


def _candidata(palabra: str, vocab: frozenset[str]) -> str | None:
    """Única corrección a distancia 1, o None si no hay o es ambigua."""
    opciones = {v for v in vocab
                if abs(len(v) - len(palabra)) <= 1 and distancia_uno(palabra, v)}
    if len(opciones) == 1:
        return opciones.pop()
    # Varias opciones: se prefiere la que comparte la primera letra y luego la
    # de igual largo; si aun así hay empate, no se corrige.
    mismas = sorted(o for o in opciones if o[0] == palabra[0])
    return mismas[0] if len(mismas) == 1 else None


def _nombres_propios(texto: str) -> set[str]:
    """Palabras con mayúscula inicial que no abren la frase (en plano)."""
    tokens = _RE_PALABRA_ORIGINAL.findall(normalizar(texto))
    return {plano(t) for t in tokens[1:] if t[:1].isupper()}


def corregir(texto: str) -> str:
    """Texto plano con las palabras corregidas hacia el vocabulario de AlojaU."""
    vocab = _vocabulario()
    propios = _nombres_propios(texto)
    salida: list[str] = []
    for palabra in plano(texto).split():
        if (len(palabra) < _LARGO_MINIMO or not palabra.isalpha()
                or palabra in vocab or palabra in propios
                or palabra in _NO_CORREGIR):
            salida.append(palabra)
            continue
        salida.append(_candidata(palabra, vocab) or palabra)
    return " ".join(salida)
