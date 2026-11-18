"""Base de conocimiento del chatbot: recuperación por palabras clave sobre kb/*.md.

Sin embeddings ni servicios externos ($0): los documentos son pocos y se
puntúan por solapamiento de raíces de palabras (sin tildes, prefijo de 5
letras para que «publicar/publico/publicación» coincidan). Cada documento
puede traer una línea final `Palabras clave: a, b, c` (pesa más que el
cuerpo y NO se muestra al modelo). Sin E/S en caliente: carga perezosa con
caché en memoria.
"""
import pathlib
import re
import unicodedata

from app.services.search import STOP_WORDS_ES

_KB_DIR = pathlib.Path(__file__).resolve().parent / "kb"
_CACHE: dict[str, list[dict]] = {"docs": []}

_FRAGMENTO_MAX = 1400
_PUNTOS_MINIMOS = 2
_RAIZ = 5
_RE_PALABRA = re.compile(r"[a-z0-9]+")
_RE_CLAVES = re.compile(r"\n*Palabras clave:\s*(.+?)\s*$", re.IGNORECASE | re.DOTALL)

# Palabras de pregunta que no orientan hacia ningún documento.
_RUIDO = frozenset({
    "como", "que", "para", "sirve", "hace", "funciona", "funcionalidad",
    "puedo", "quiero", "donde", "cual", "cuales", "dime", "explica", "app",
    "aplicacion", "plataforma", "alojau", "hay", "hola", "necesito", "saber",
})

# Sinónimos de uso frecuente -> palabra canónica de la KB.
_SINONIMOS = {
    "companero": "roomies", "companera": "roomies", "companeros": "roomies",
    "companeras": "roomies", "roommate": "roomies", "roommates": "roomies",
    "roomie": "roomies",
    "canon": "precio", "cuesta": "precio", "cuestan": "precio",
    "vale": "precio", "valen": "precio", "arriendo": "precio",
    "barrio": "zona", "barrios": "zona", "sector": "zona",
    "guardar": "favoritos", "guardo": "favoritos", "guarda": "favoritos",
    "gusta": "favoritos", "gustaria": "favoritos",
    "avisar": "alertas", "avisarme": "alertas", "notificar": "alertas",
    "notificacion": "alertas", "notificaciones": "alertas",
    "olvide": "recuperar", "clave": "recuperar", "contrasena": "recuperar",
}

# Frases que se reemplazan antes de partir en palabras.
_FRASES_SINONIMAS = (
    ("cuanto cuesta", "precio"),
    ("cuanto vale", "precio"),
    ("me gustaria", "favoritos"),
    ("me gusta", "favoritos"),
    ("recuperar contrasena", "recuperar"),
)


def _sin_tildes(texto: str) -> str:
    base = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in base if unicodedata.category(c) != "Mn")


def _con_sinonimos(texto: str) -> str:
    """Minúsculas sin tildes con frases y palabras llevadas a su canónico."""
    base = _sin_tildes(texto or "")
    for frase, canonica in _FRASES_SINONIMAS:
        base = base.replace(frase, canonica)
    return base


def _raices(texto: str) -> set[str]:
    """Raíces (prefijo de 5 letras) de las palabras significativas."""
    salida: set[str] = set()
    for palabra in _RE_PALABRA.findall(_con_sinonimos(texto)):
        palabra = _SINONIMOS.get(palabra, palabra)
        if (len(palabra) < 3 or palabra in _RUIDO
                or palabra in STOP_WORDS_ES):
            continue
        salida.add(palabra[:_RAIZ])
    return salida


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
            claves = ""
            mc = _RE_CLAVES.search(cuerpo)
            if mc:
                claves = mc.group(1)
                cuerpo = cuerpo[:mc.start()].strip()
            docs.append({
                "doc": path.stem, "titulo": titulo, "texto": cuerpo,
                "r_titulo": _raices(titulo), "r_claves": _raices(claves),
                "r_cuerpo": _raices(cuerpo),
            })
    _CACHE["docs"] = docs
    return docs


def clear_faq_cache_for_tests() -> None:
    _CACHE["docs"] = []


def buscar_en_faq(pregunta: str, tope: int = 2) -> list[dict]:
    """Top-N fragmentos {doc, titulo, fragmento} por solapamiento de raíces.

    Pesos: palabra clave 3, título 3, cuerpo 1. Bajo el umbral mínimo no
    devuelve nada (el orquestador responde «sin documentación»).
    """
    consulta = _raices(pregunta)
    if not consulta:
        return []
    puntuados: list[tuple[int, dict]] = []
    for doc in _cargar():
        puntos = (3 * len(consulta & doc["r_claves"])
                  + 3 * len(consulta & doc["r_titulo"])
                  + len(consulta & doc["r_cuerpo"]))
        if puntos >= _PUNTOS_MINIMOS:
            puntuados.append((puntos, doc))
    puntuados.sort(key=lambda p: p[0], reverse=True)
    mejor = puntuados[0][0] if puntuados else 0
    salida: list[dict] = []
    for puntos, doc in puntuados[:max(1, min(int(tope or 2), 3))]:
        if puntos * 2 < mejor:  # descarta documentos claramente menos relevantes
            break
        salida.append({
            "doc": doc["doc"],
            "titulo": doc["titulo"],
            "fragmento": doc["texto"][:_FRAGMENTO_MAX],
        })
    return salida
