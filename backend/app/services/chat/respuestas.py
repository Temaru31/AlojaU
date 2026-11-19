"""Respuestas fijas por intención (sin LLM) y botones permitidos.

Cada categoría distinta de `consulta` responde con un texto corto en español
colombiano, sin emojis, y botones cuyas rutas pertenecen a la allowlist.
"""
from app.services.chat.rutas import ruta_permitida

RESPUESTA_SALUDO = (
    "Hola, soy el asistente de AlojaU. ¿Qué quieres saber de la plataforma?")

RESPUESTA_IDENTIDAD = (
    "Soy el asistente automático de AlojaU: un programa con inteligencia "
    "artificial, no una persona. Solo explico cómo funciona AlojaU y no veo "
    "tus datos personales ni los de otros usuarios.")

RESPUESTA_SIN_CONTEXTO = (
    "¿Sobre qué tema quieres que te explique? Puedo contarte, por ejemplo, "
    "cómo publicar un aviso, qué es Roomies o cómo funciona el índice de "
    "confianza.")

OFERTA_AMPLIAR = "¿Quieres que te dé más detalle?"

RESPUESTA_AGRADECIMIENTO = (
    "Con gusto. Si te queda otra duda sobre AlojaU, aquí estoy para explicarte "
    "la búsqueda, Roomies, los favoritos o las alertas.")

RESPUESTA_DESPEDIDA = (
    "Hasta luego. Si necesitas ayuda con AlojaU más adelante, puedes volver a "
    "escribirme.")

RESPUESTA_AYUDA_GENERAL = (
    "Soy el asistente de AlojaU. Te explico cómo buscar vivienda con filtros, "
    "qué es el índice de confianza, cómo guardar favoritos y comparar avisos, "
    "cómo funcionan las alertas y Roomies, y cómo publicar o administrar tus "
    "avisos. También te indico en qué sección de la plataforma hacer cada "
    "cosa. No tengo acceso a tus datos ni ejecuto trámites.")

RESPUESTA_INYECCION = (
    "No puedo cambiar mis instrucciones ni revelar información interna; solo "
    "explico cómo funciona AlojaU. Recuerda no compartir contraseñas, datos "
    "bancarios ni códigos de verificación por el chat. ¿Sobre qué "
    "funcionalidad quieres saber?")

RESPUESTA_DATO_SENSIBLE = (
    "Por seguridad, no escribas en el chat contraseñas, claves bancarias, "
    "números de tarjeta, números de cédula ni códigos de verificación. Este "
    "asistente nunca te los va a pedir. Si olvidaste tu contraseña, usa la "
    "opción Recuperar contraseña.")

RESPUESTA_ACCION_NO_PERMITIDA = (
    "Este asistente solo explica cómo funciona AlojaU: no puede publicar "
    "avisos, contactar arrendadores, reservar, pagar, borrar cuentas ni "
    "cambiar precios por ti. Esas acciones se hacen directamente en la "
    "sección correspondiente de la plataforma. ¿Quieres que te indique dónde?")

RESPUESTA_FUERA_DE_TEMA = (
    "Ese tema no hace parte de AlojaU. Solo puedo ayudarte con la búsqueda de "
    "vivienda, el índice de confianza, favoritos, alertas, Roomies, publicar "
    "avisos y tu perfil. ¿Sobre cuál quieres saber?")


def _accion(etiqueta: str, ruta: str) -> dict:
    return {"etiqueta": etiqueta, "ruta": ruta}


_FIJAS: dict[str, tuple[str, tuple[dict, ...]]] = {
    "saludo": (RESPUESTA_SALUDO, (
        _accion("Publicar un aviso", "/publicar"),
        _accion("Ir a Roomies", "/roomies"),
        _accion("Ver favoritos", "/favoritos"),
    )),
    "identidad": (RESPUESTA_IDENTIDAD, ()),
    "sin_contexto": (RESPUESTA_SIN_CONTEXTO, ()),
    "agradecimiento": (RESPUESTA_AGRADECIMIENTO, ()),
    "despedida": (RESPUESTA_DESPEDIDA, ()),
    "ayuda_general": (RESPUESTA_AYUDA_GENERAL, (
        _accion("Ir a la búsqueda", "/"),
        _accion("Ir a Roomies", "/roomies"),
        _accion("Mi perfil", "/perfil"),
    )),
    "inyeccion": (RESPUESTA_INYECCION, (
        _accion("Ir a la búsqueda", "/"),
        _accion("Ir a Roomies", "/roomies"),
    )),
    "dato_sensible": (RESPUESTA_DATO_SENSIBLE, (
        _accion("Recuperar contraseña", "/recuperar"),
        _accion("Mi perfil", "/perfil"),
    )),
    "accion_no_permitida": (RESPUESTA_ACCION_NO_PERMITIDA, (
        _accion("Publicar un aviso", "/publicar"),
        _accion("Mis publicaciones", "/mis-publicaciones"),
        _accion("Mi perfil", "/perfil"),
    )),
    "fuera_de_tema": (RESPUESTA_FUERA_DE_TEMA, (
        _accion("Ir a la búsqueda", "/"),
        _accion("Ir a Roomies", "/roomies"),
        _accion("Publicar un aviso", "/publicar"),
    )),
}


# Preguntas sugeridas por categoría (texto que el widget envía tal cual).
_SUGERENCIAS_GENERALES = (
    "¿Cómo publico un aviso?",
    "¿Qué es Roomies?",
    "¿Qué es el índice de confianza?",
)
_SIN_SUGERENCIAS = frozenset({"despedida", "dato_sensible"})


def sugerencias_para(categoria: str) -> list[str]:
    """Preguntas sugeridas de una respuesta fija (vacío en despedida y datos)."""
    if str(categoria or "") in _SIN_SUGERENCIAS:
        return []
    return list(_SUGERENCIAS_GENERALES)


def respuesta_para(categoria: str) -> tuple[str, list[dict]]:
    """Texto y botones fijos de una categoría; rutas siempre permitidas."""
    texto, acciones = _FIJAS.get(str(categoria or ""),
                                 _FIJAS["ayuda_general"])
    return texto, [dict(a) for a in acciones if ruta_permitida(a["ruta"])][:5]
