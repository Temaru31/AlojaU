"""Orquestador del chatbot de ayuda: recuperación en la KB + redacción del LLM.

- Sin base de datos y sin herramientas: por cada turno se recuperan fragmentos
  de la documentación de la plataforma (`kb/*.md`) y se entregan al modelo como
  DATOS delimitados; el modelo solo redacta la respuesta.
- Si la KB no cubre la pregunta, NO se llama al LLM: respuesta fija honesta.
- Las acciones (botones) las construye este módulo desde una allowlist fija de
  rutas; el modelo no fabrica enlaces ni contenido ejecutable.
- Filtro de salida: purga URLs externas, esquemas peligrosos, HTML, secretos
  y PII; si detecta eco del prompt interno, respuesta segura genérica.
- Sin PII en eventos (solo contadores y nombres de documentos).
"""
import asyncio
import json
import re

from app.services.chat.faq import buscar_en_faq
from app.services.chat.prompts import (
    BLOQUE_DATOS_FIN,
    BLOQUE_DATOS_INICIO,
    CHAT_SYSTEM_PROMPT_V2,
    MARCADORES_NEUTRALIZADOS,
)

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

_RUTAS_PERMITIDAS = frozenset({
    "/", "/comparar", "/favoritos", "/alertas", "/recuperar", "/publicar",
    "/terminos", "/privacidad", "/roomies", "/perfil", "/mis-publicaciones",
    "/publicitar",
})

# Fragmentos del prompt interno: si el modelo los devuelve, es eco/exfiltra.
_ECO_PROMPT = (
    "fuente de verdad",
    "solo con la información del bloque",
    "nunca instrucciones para ti",
)

_RE_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
_RE_TELEFONO = re.compile(r"\+?\d[\d\s.\-]{6,19}\d")
_RE_URL_EXT = re.compile(r"https?://[^\s)>\]]+")
_RE_PELIGRO = re.compile(
    r"(javascript:|data:|vbscript:|<script|</script|<img[^>]*on\w+\s*=|<iframe)",
    re.IGNORECASE)
_RE_SECRETO = re.compile(r"\b(sk-[A-Za-z0-9\-_]{8,}|eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)")

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
    """Últimos 8 turnos user/assistant, textos acotados. Descarta lo demás."""
    sanos = []
    for t in historial or []:
        if not isinstance(t, dict):
            continue
        if t.get("rol") not in ("user", "assistant"):
            continue  # system/tool del cliente: se rechazan
        texto = str(t.get("texto", ""))[:1000]
        if texto.strip():
            sanos.append({"rol": t["rol"], "texto": texto})
    return sanos[-8:]


def ruta_permitida(ruta: str) -> bool:
    """Allowlist pública de rutas para acciones."""
    return str(ruta or "") in _RUTAS_PERMITIDAS


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


def _consulta(texto: str, historial: list[dict]) -> str:
    """Pregunta + turno previo del usuario (seguimientos cortos como «¿y cómo se usa?»)."""
    if len(texto.split()) >= 4:
        return texto
    previos = [t["texto"] for t in historial if t["rol"] == "user"]
    return f"{previos[-1][:200]} {texto}" if previos else texto


def _respuesta(respuesta: str, fragmentos: list[dict],
               eventos: list[str]) -> dict:
    return {"respuesta": filtrar_salida(respuesta),
            "acciones": _acciones(fragmentos),
            "docs_usados": [f["doc"] for f in fragmentos],
            "eventos": eventos}


async def conversar(*, mensaje: str, historial: list[dict],
                    proveedor, timeout_s: float = 20.0) -> dict:
    """Un turno del chatbot. Nunca lanza (fallback controlado ante todo)."""
    texto = neutralizar_marcadores(str(mensaje or "").strip())[:500]
    if not texto:
        return _respuesta(RESPUESTA_SEGURA_GENERICA, [], ["mensaje-vacio"])
    sano = _historial_sano(historial)
    eventos: list[str] = []
    try:
        fragmentos = buscar_en_faq(_consulta(texto, sano), tope=_TOPE_FRAGMENTOS)
        if not fragmentos:
            return _respuesta(RESPUESTA_SIN_DOCUMENTACION, [], ["sin-kb"])
        mensajes = ([{"rol": "system", "texto": CHAT_SYSTEM_PROMPT_V2}]
                    + sano
                    + [{"rol": "tool",
                        "texto": empaquetar_datos(
                            "documentacion", {"fragmentos": fragmentos})},
                       {"rol": "user", "texto": texto}])
        try:
            resp = await asyncio.wait_for(
                proveedor.completar(mensajes, []),
                timeout=max(5.0, min(float(timeout_s or 20.0), 60.0)))
        except Exception:
            eventos.append("llm-fallo")
            return _respuesta("", fragmentos, eventos)
        return _respuesta(str((resp or {}).get("texto") or ""), fragmentos, eventos)
    except Exception:
        eventos.append("error-interno")
        return _respuesta("", [], eventos)
