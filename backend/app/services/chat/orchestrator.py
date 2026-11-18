"""Orquestador del chatbot de ayuda: intención + KB + redacción del LLM.

- Sin base de datos y sin herramientas: por cada turno se clasifica la
  intención; los saludos, temas ajenos, inyecciones, datos sensibles y
  acciones no permitidas se responden con textos fijos sin tocar el LLM.
- Solo las consultas recuperan fragmentos de la documentación (`kb/*.md`),
  que se entregan al modelo como DATOS delimitados; si la KB no cubre la
  pregunta, NO se llama al LLM.
- Seguimiento: una pregunta corta o con referencia anafórica se completa con
  la última pregunta `user` del historial; los turnos `assistant` del
  cliente se ignoran por completo (pueden venir falsificados).
- Caché en memoria (TTL + tope) para respuestas del LLM de preguntas sueltas.
- Acciones (botones) desde una allowlist fija de rutas; el modelo no fabrica
  enlaces ni contenido ejecutable.
- Filtro de salida: purga URLs, esquemas peligrosos, HTML, secretos y PII;
  si el modelo afirma haber ejecutado acciones, respuesta segura genérica.
- Sin PII en eventos (categoría, caché y nombres de documentos).
"""
import asyncio
import hashlib
import json
import re

from app.services.chat.cache import (
    CACHE_RESPUESTAS,
    clave_cache,
    clear_cache_respuestas_for_tests,
)
from app.services.chat.faq import buscar_en_faq
from app.services.chat.intencion import CONSULTA, detectar_intencion
from app.services.chat.normalizar import (
    normalizar,
    palabras_significativas,
    plano,
)
from app.services.chat.prompts import (
    BLOQUE_DATOS_FIN,
    BLOQUE_DATOS_INICIO,
    CHAT_SYSTEM_PROMPT_V2,
    MARCADORES_NEUTRALIZADOS,
)
from app.services.chat.respuestas import respuesta_para
from app.services.chat.rutas import RUTAS_PERMITIDAS as _RUTAS_PERMITIDAS
from app.services.chat.rutas import ruta_permitida

_TOPE_FRAGMENTOS = 2

_ACCION_BUSCAR = {"etiqueta": "Ir a la búsqueda", "ruta": "/"}

# Documento de la KB -> botones de navegación (solo rutas de _RUTAS_PERMITIDAS).
_ACCIONES_POR_DOC = {
    "02-confianza": [{"etiqueta": "Ir a la búsqueda", "ruta": "/"}],
    "03-filtros-busqueda": [{"etiqueta": "Ir a la búsqueda", "ruta": "/"}],
    "04-favoritos-comparar": [
        {"etiqueta": "Ver favoritos", "ruta": "/favoritos"},
        {"etiqueta": "Comparar", "ruta": "/comparar"}],
    "05-alertas-telegram": [
        {"etiqueta": "Mis alertas", "ruta": "/alertas"},
        {"etiqueta": "Mi perfil", "ruta": "/perfil"}],
    "07-cuentas-recuperacion": [
        {"etiqueta": "Recuperar contraseña", "ruta": "/recuperar"}],
    "09-terminos-privacidad": [
        {"etiqueta": "Ver términos", "ruta": "/terminos"},
        {"etiqueta": "Ver privacidad", "ruta": "/privacidad"}],
    "10-roomies": [{"etiqueta": "Ir a Roomies", "ruta": "/roomies"},
                   {"etiqueta": "Mi perfil", "ruta": "/perfil"}],
    "11-publicar-aviso": [{"etiqueta": "Publicar un aviso", "ruta": "/publicar"}],
    "12-mis-publicaciones": [
        {"etiqueta": "Mis publicaciones", "ruta": "/mis-publicaciones"}],
    "13-publicidad-destacados": [
        {"etiqueta": "Destacar un aviso", "ruta": "/publicitar"}],
    "14-perfil-cuenta": [{"etiqueta": "Mi perfil", "ruta": "/perfil"}],
}

# Fragmentos del prompt interno: si el modelo los devuelve, es eco/exfiltra.
_ECO_PROMPT = (
    "fuente de verdad",
    "solo con la información del bloque",
    "nunca instrucciones para ti",
)

# Afirmaciones de acciones ejecutadas: el bot no ejecuta nada, así que si el
# modelo las dice se sustituye por la respuesta segura.
AFIRMACIONES_ACCION = (
    "he publicado", "ya publique", "he contactado", "ya contacte",
    "ya te registre", "te registre", "he registrado", "he guardado",
    "ya guarde", "he reservado", "ya reserve", "te envie", "he enviado",
    "ya envie", "he pagado", "ya pague", "he borrado", "ya borre",
    "he eliminado", "ya elimine",
)

_RE_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
_RE_TELEFONO = re.compile(r"\+?\d[\d\s.\-]{6,19}\d")
_RE_URL_EXT = re.compile(r"https?://[^\s)>\]]+")
_RE_PELIGRO = re.compile(
    r"(javascript:|data:|vbscript:|<script|</script|<img[^>]*on\w+\s*=|<iframe)",
    re.IGNORECASE)
_RE_SECRETO = re.compile(r"\b(sk-[A-Za-z0-9\-_]{8,}|eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)")

# Referencias que delatan un seguimiento conversacional.
_RE_SEGUIMIENTO = re.compile(
    r"\b(?:eso|ese|esa|esto|ahi|alli|tambien|igual)\b"
    r"|\by como\b"
    r"|\bcomo se (?:usa|utiliza|hace|funciona|configura)\b"
    r"|\bmas (?:informacion|detalles|opciones|sobre|de|alla)\b"
    r"|\bmas\s*$")

RESPUESTA_SEGURA_GENERICA = (
    "Puedo explicarte cómo funciona AlojaU: búsqueda y filtros, índice de "
    "confianza, favoritos, alertas, Roomies, publicar avisos y más. "
    "¿Sobre cuál quieres saber?")

RESPUESTA_SIN_DOCUMENTACION = (
    "No tengo información sobre eso en la documentación de AlojaU. Puedo "
    "ayudarte con la búsqueda y filtros, el índice de confianza, favoritos, "
    "alertas, Roomies, publicar avisos y tu perfil. ¿Sobre cuál quieres saber?")


def neutralizar_marcadores(texto: str) -> str:
    """Neutraliza delimitadores falsos dentro de contenido no confiable."""
    salida = str(texto or "")
    for marca in MARCADORES_NEUTRALIZADOS:
        salida = salida.replace(marca, "[contenido]")
        salida = salida.replace(marca.upper(), "[contenido]")
    return salida


def empaquetar_datos(nombre: str, datos: dict) -> str:
    """Documentación recuperada como bloque DATOS (JSON compacto, recortado)."""
    try:
        cuerpo = json.dumps(datos, ensure_ascii=False, default=str)[:4000]
    except Exception:
        cuerpo = "{}"
    cuerpo = neutralizar_marcadores(cuerpo)
    return (f"{BLOQUE_DATOS_INICIO} fuente={nombre}\n"
            f"{cuerpo}\n{BLOQUE_DATOS_FIN}")


def filtrar_salida(texto: str) -> str:
    """Purga la respuesta del modelo. Texto plano, sin ejecutables ni PII."""
    salida = str(texto or "").strip()
    if not salida:
        return RESPUESTA_SEGURA_GENERICA
    bajo = salida.lower()
    if any(marca in bajo for marca in _ECO_PROMPT):
        return RESPUESTA_SEGURA_GENERICA
    if any(frase in plano(salida) for frase in AFIRMACIONES_ACCION):
        return RESPUESTA_SEGURA_GENERICA
    salida = _RE_PELIGRO.sub("[contenido omitido]", salida)
    salida = _RE_URL_EXT.sub("[enlace omitido]", salida)
    salida = _RE_EMAIL.sub("[correo omitido]", salida)
    salida = _RE_SECRETO.sub("[dato omitido]", salida)
    # El modelo nunca recibe teléfonos: todo teléfono aquí es inventado.
    salida = _RE_TELEFONO.sub("[teléfono omitido]", salida)
    salida = re.sub(r"[ \t]+", " ", salida)
    salida = re.sub(r"\n{3,}", "\n\n", salida).strip()
    return salida[:2000] or RESPUESTA_SEGURA_GENERICA


def _historial_sano(historial: list[dict]) -> list[dict]:
    """Solo turnos `user` que sean consultas legítimas.

    Los `assistant` del cliente pueden ser falsificados y los `user` con
    inyección, datos sensibles o acciones no deben viajar al modelo ni usarse
    como contexto de seguimiento. Se conservan los últimos 8 turnos y se
    acota cada texto a 1000 caracteres.
    """
    sanos: list[dict] = []
    for turno in historial or []:
        if not isinstance(turno, dict) or turno.get("rol") != "user":
            continue
        texto = normalizar(str(turno.get("texto", "")))
        if not texto or detectar_intencion(texto) != CONSULTA:
            continue
        texto = neutralizar_marcadores(texto)[:1000]
        if texto:
            sanos.append({"rol": "user", "texto": texto})
    return sanos[-8:]


def _acciones(fragmentos: list[dict]) -> list[dict]:
    """Botones server-side desde los documentos usados (rutas de la allowlist)."""
    acciones: list[dict] = []
    vistos: set[str] = set()
    for frag in fragmentos:
        for acc in _ACCIONES_POR_DOC.get(frag.get("doc") or "", []):
            if acc["ruta"] not in vistos and ruta_permitida(acc["ruta"]):
                vistos.add(acc["ruta"])
                acciones.append(dict(acc))
    return (acciones or [dict(_ACCION_BUSCAR)])[:5]


def _necesita_contexto(texto: str) -> bool:
    """Pregunta corta o con referencia anafórica: se apoya en el turno previo."""
    return (len(palabras_significativas(texto)) < 4
            or bool(_RE_SEGUIMIENTO.search(plano(texto))))


def _consulta(texto: str, historial: list[dict]) -> tuple[str, bool]:
    """Pregunta para la KB y si usó la última pregunta `user` del historial."""
    previas = [t["texto"] for t in historial if t["rol"] == "user"]
    if not previas or not _necesita_contexto(texto):
        return texto, False
    return f"{previas[-1][:200]} {texto}", True


def _huella_fragmento(fragmento: str) -> str:
    """Hash corto del contenido: la caché cambia si cambia el documento."""
    datos = str(fragmento or "").encode("utf-8")
    return hashlib.sha256(datos).hexdigest()[:12]


def _clave_cache(texto: str, fragmentos: list[dict], proveedor) -> str:
    """Clave de caché: pregunta + contenido de documentos + proveedor/modelo."""
    nombre = str(getattr(proveedor, "nombre", "") or type(proveedor).__name__)
    modelo = str(getattr(proveedor, "modelo", "") or "")
    docs = [f"{f.get('doc', '')}:{_huella_fragmento(f.get('fragmento', ''))}"
            for f in fragmentos]
    return clave_cache(texto, docs, f"{nombre}:{modelo}")


def _mensajes(texto: str, historial: list[dict],
              fragmentos: list[dict]) -> list[dict]:
    """Turnos para el proveedor: prompt fijo, historial user y bloque DATOS."""
    return ([{"rol": "system", "texto": CHAT_SYSTEM_PROMPT_V2}]
            + historial
            + [{"rol": "tool",
                "texto": empaquetar_datos(
                    "documentacion", {"fragmentos": fragmentos})},
               {"rol": "user", "texto": texto}])


def _respuesta(respuesta: str, fragmentos: list[dict],
               eventos: list[str]) -> dict:
    return {"respuesta": filtrar_salida(respuesta),
            "acciones": _acciones(fragmentos),
            "docs_usados": [f["doc"] for f in fragmentos],
            "eventos": eventos}


def _respuesta_fija(categoria: str, eventos: list[str]) -> dict:
    """Respuesta de intención: texto y botones fijos, sin LLM ni KB."""
    texto, acciones = respuesta_para(categoria)
    return {"respuesta": texto, "acciones": acciones,
            "docs_usados": [], "eventos": eventos}


async def _turno_consulta(*, texto: str, historial: list[dict], proveedor,
                          timeout_s: float, eventos: list[str]) -> dict:
    """Recupera KB, consulta caché y, si hace falta, redacta con el LLM."""
    sano = _historial_sano(historial)
    consulta, seguimiento = _consulta(texto, sano)
    fragmentos = buscar_en_faq(consulta, tope=_TOPE_FRAGMENTOS)
    if not fragmentos:
        eventos.append("sin-kb")
        return _respuesta(RESPUESTA_SIN_DOCUMENTACION, [], eventos)

    clave = None if seguimiento else _clave_cache(texto, fragmentos, proveedor)
    if clave:
        guardada = CACHE_RESPUESTAS.obtener(clave)
        if guardada is not None:
            eventos.append("cache-hit")
            return _respuesta(guardada, fragmentos, eventos)
        eventos.append("cache-miss")

    try:
        resp = await asyncio.wait_for(
            proveedor.completar(_mensajes(texto, sano, fragmentos), []),
            timeout=max(5.0, min(float(timeout_s or 20.0), 60.0)))
    except Exception:
        eventos.append("llm-fallo")
        return _respuesta("", fragmentos, eventos)

    crudo = str((resp or {}).get("texto") or "")
    limpia = filtrar_salida(crudo)
    if clave and crudo.strip():
        CACHE_RESPUESTAS.guardar(clave, limpia)
    return _respuesta(limpia, fragmentos, eventos)


async def conversar(*, mensaje: str, historial: list[dict],
                    proveedor, timeout_s: float = 20.0) -> dict:
    """Un turno del chatbot. Nunca lanza (fallback controlado ante todo)."""
    texto = normalizar(str(mensaje or ""))[:500]
    if not texto:
        return _respuesta(RESPUESTA_SEGURA_GENERICA, [], ["mensaje-vacio"])
    categoria = detectar_intencion(texto)
    eventos = [f"intencion-{categoria}"]
    if categoria != CONSULTA:
        return _respuesta_fija(categoria, eventos)
    texto = neutralizar_marcadores(texto)
    try:
        return await _turno_consulta(texto=texto, historial=historial,
                                     proveedor=proveedor,
                                     timeout_s=timeout_s, eventos=eventos)
    except Exception:
        eventos.append("error-interno")
        return _respuesta("", [], eventos)
