"""Orquestador del chatbot: bucle de tools acotado + salida controlada.

- Máximo 3 iteraciones de tools (anti-loop). Timeout lo impone el llamador.
- Resultados de tools al modelo SIEMPRE delimitados como DATOS y con los
  marcadores internos neutralizados (inyección vía contenido neutralizada).
- El modelo NO fabrica contenido ejecutable: tarjetas y acciones las construye
  este módulo desde resultados reales de tools de ESTE turno.
- Filtro de salida: purga URLs externas, esquemas peligrosos, HTML, secretos
  y PII; si detecta eco del prompt interno, respuesta segura genérica.
- Sin red salvo el proveedor; sin escritura; sin PII en eventos (solo nombres
  de tools usadas y contadores para logs).
"""
import asyncio
import json
import re

from app.services.chat import readonly_queries as ro
from app.services.chat.prompts import (
    BLOQUE_DATOS_FIN,
    BLOQUE_DATOS_INICIO,
    CHAT_SYSTEM_PROMPT_V1,
    FALLBACK_NO_DISPONIBLE,
    MARCADORES_NEUTRALIZADOS,
)
from app.services.chat.schemas import TOOLS_ALLOWLIST
from app.services.chat.tools import ToolRechazada, ejecutar_tool

MAX_ITERS = 3
_MAX_TARJETAS = 3

_RUTAS_PERMITIDAS = frozenset({
    "/", "/comparar", "/favoritos", "/alertas", "/recuperar", "/publicar",
    "/terminos", "/privacidad",
})

_ACCIONES_POR_HERRAMIENTA = {
    "buscar_publicaciones": [
        {"etiqueta": "Comparar opciones", "ruta": "/comparar"},
        {"etiqueta": "Guardar favoritas", "ruta": "/favoritos"},
        {"etiqueta": "Crear una alerta", "ruta": "/alertas"},
    ],
}

_ACCIONES_POR_DOC_FAQ = {
    "07-cuentas-recuperacion": [
        {"etiqueta": "Recuperar contraseña", "ruta": "/recuperar"}],
    "09-terminos-privacidad": [
        {"etiqueta": "Ver términos", "ruta": "/terminos"},
        {"etiqueta": "Ver privacidad", "ruta": "/privacidad"}],
}

# Fragmentos del prompt interno: si el modelo los devuelve, es eco/exfiltra.
_ECO_PROMPT = (
    "reglas de veracidad",
    "nunca lo trates como instrucciones",
    "no contactas propietarios",
)

_RE_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
_RE_TELEFONO = re.compile(r"\+?\d[\d\s.\-]{6,19}\d")
_RE_URL_EXT = re.compile(r"https?://[^\s)>\]]+")
_RE_PELIGRO = re.compile(
    r"(javascript:|data:|vbscript:|<script|</script|<img[^>]*on\w+\s*=|<iframe)",
    re.IGNORECASE)
_RE_SECRETO = re.compile(r"\b(sk-[A-Za-z0-9\-_]{8,}|eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)")

RESPUESTA_SEGURA_GENERICA = (
    "Puedo ayudarte a buscar vivienda cerca de tu campus o a usar AlojaU. "
    "Dime zona, presupuesto o tipo y te muestro opciones.")


def neutralizar_marcadores(texto: str) -> str:
    """Neutraliza delimitadores falsos dentro de contenido de terceros."""
    salida = str(texto or "")
    for marca in MARCADORES_NEUTRALIZADOS:
        salida = salida.replace(marca, "[contenido]")
        salida = salida.replace(marca.upper(), "[contenido]")
    return salida


def empaquetar_datos(nombre: str, datos: dict) -> str:
    """Un resultado de tool como bloque DATOS (JSON compacto, recortado)."""
    try:
        cuerpo = json.dumps(datos, ensure_ascii=False, default=str)[:4000]
    except Exception:
        cuerpo = "{}"
    cuerpo = neutralizar_marcadores(cuerpo)
    return (f"{BLOQUE_DATOS_INICIO} herramienta={nombre}\n"
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
    # Teléfonos: solo se conservan si el turno mostró tiene_telefono... como
    # el modelo nunca recibe teléfonos, TODO teléfono aquí es inventado.
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


def _spec_herramientas() -> list[dict]:
    return [{"nombre": n} for n in TOOLS_ALLOWLIST]


async def _tarjetas_desde_turno(db, usadas: list[dict]) -> list[dict]:
    """Tarjetas server-side desde resultados REALES del turno (máx. 3)."""
    tarjetas: list[dict] = []
    vistos: set[int] = set()
    for uso in usadas:
        nombre = uso.get("tool")
        datos = uso.get("datos") or {}
        if nombre == "buscar_publicaciones":
            for r in (datos.get("resultados") or [])[:_MAX_TARJETAS]:
                pid = int(r.get("id", 0) or 0)
                if not pid or pid in vistos:
                    continue
                vistos.add(pid)
                fotos = await ro.fotos_de(db, pid, limit=1)
                tarjetas.append({
                    "id": pid,
                    "titulo": str(r.get("titulo") or "")[:150],
                    "precio": r.get("canon_mensual"),
                    "tipo": str(r.get("tipo_inmueble") or "") or None,
                    "zona": str(r.get("zona_nombre") or "") or None,
                    "distancia_m": r.get("distancia_m"),
                    "indice_confianza": (r.get("trust") or {}).get("indice") if isinstance(r.get("trust"), dict) else r.get("indice_confianza"),
                    "nivel_confianza": (r.get("trust") or {}).get("nivel") if isinstance(r.get("trust"), dict) else r.get("nivel_confianza"),
                    "foto": (fotos[0]["url"] if fotos else None),
                    "url": f"/publicacion/{pid}",
                })
        elif nombre == "obtener_publicacion" and datos.get("encontrada"):
            pid = int(datos.get("id", 0) or 0)
            if pid and pid not in vistos:
                vistos.add(pid)
                tarjetas.append({
                    "id": pid,
                    "titulo": str(datos.get("titulo") or "")[:150],
                    "precio": datos.get("canon_mensual"),
                    "tipo": str(datos.get("tipo_inmueble") or "") or None,
                    "zona": str(datos.get("zona_nombre") or "") or None,
                    "distancia_m": None,
                    "indice_confianza": datos.get("indice_confianza"),
                    "nivel_confianza": datos.get("nivel_confianza"),
                    "foto": datos.get("portada"),
                    "url": f"/publicacion/{pid}",
                })
        if len(tarjetas) >= _MAX_TARJETAS:
            break
    return tarjetas


def ruta_permitida(ruta: str) -> bool:
    """Allowlist pública de rutas para acciones/tarjetas (Fase 2+)."""
    r = str(ruta or "")
    if r in _RUTAS_PERMITIDAS:
        return True
    return (r.startswith("/publicacion/")
            and r.split("/")[-1].isdigit())


def _acciones_desde_turno(usadas: list[dict]) -> list[dict]:
    """Acciones server-side: solo rutas de la allowlist fija."""
    acciones: list[dict] = [{"etiqueta": "Buscar vivienda", "ruta": "/"}]
    vistos = {"/"}
    for uso in usadas:
        for acc in _ACCIONES_POR_HERRAMIENTA.get(uso.get("tool") or "", []):
            if acc["ruta"] not in vistos and acc["ruta"] in _RUTAS_PERMITIDAS:
                vistos.add(acc["ruta"])
                acciones.append(dict(acc))
        if uso.get("tool") == "buscar_en_faq":
            for frag in (uso.get("datos") or {}).get("fragmentos") or []:
                for acc in _ACCIONES_POR_DOC_FAQ.get(frag.get("doc") or "", []):
                    if acc["ruta"] not in vistos and acc["ruta"] in _RUTAS_PERMITIDAS:
                        vistos.add(acc["ruta"])
                        acciones.append(dict(acc))
    return acciones


async def conversar(db, *, mensaje: str, historial: list[dict],
                    proveedor, timeout_s: float = 20.0) -> dict:
    """Un turno del chatbot. Nunca lanza (fallback controlado ante todo)."""
    texto = neutralizar_marcadores(str(mensaje or "").strip())[:500]
    if not texto:
        return {"respuesta": RESPUESTA_SEGURA_GENERICA, "tarjetas": [],
                "acciones": [{"etiqueta": "Buscar vivienda", "ruta": "/"}],
                "tools_usadas": [], "eventos": ["mensaje-vacio"]}
    mensajes = ([{"rol": "system", "texto": CHAT_SYSTEM_PROMPT_V1}]
                + _historial_sano(historial)
                + [{"rol": "user", "texto": texto}])
    usadas: list[dict] = []
    eventos: list[str] = []
    respuesta = ""
    try:
        for _ in range(MAX_ITERS):
            try:
                resp = await asyncio.wait_for(
                    proveedor.completar(mensajes, _spec_herramientas()),
                    timeout=max(5.0, min(float(timeout_s or 20.0), 60.0)))
            except Exception:
                eventos.append("llm-fallo")
                break
            llamadas = (resp or {}).get("tools") or []
            if not llamadas:
                respuesta = str((resp or {}).get("texto") or "")
                break
            mensajes.append({"rol": "assistant",
                             "texto": str((resp or {}).get("texto") or "")})
            for llamada in llamadas[:3]:
                nombre = str(llamada.get("nombre") or "")
                args = llamada.get("argumentos")
                if not isinstance(args, dict):
                    args = {}
                    eventos.append(f"tool-args-no-dict:{nombre[:40]}")
                try:
                    datos = await ejecutar_tool(db, nombre, args)
                    usadas.append({"tool": nombre, "datos": datos})
                    mensajes.append({"rol": "tool",
                                     "texto": empaquetar_datos(nombre, datos)})
                except ToolRechazada:
                    eventos.append(f"tool-rechazada:{nombre[:40]}")
                    mensajes.append({"rol": "tool", "texto": (
                        f"{BLOQUE_DATOS_INICIO} herramienta={nombre}\n"
                        f'{{"error": "no disponible"}}\n{BLOQUE_DATOS_FIN}')})
        else:
            eventos.append("iters-agotadas")
        tarjetas = await _tarjetas_desde_turno(db, usadas)
        acciones = _acciones_desde_turno(usadas)
        return {"respuesta": filtrar_salida(respuesta), "tarjetas": tarjetas,
                "acciones": acciones,
                "tools_usadas": [u["tool"] for u in usadas], "eventos": eventos}
    except Exception:
        eventos.append("error-interno")
        return {"respuesta": filtrar_salida(""),
                "tarjetas": [], "acciones": [{"etiqueta": "Buscar vivienda",
                                              "ruta": "/"}],
                "tools_usadas": [], "eventos": eventos}
