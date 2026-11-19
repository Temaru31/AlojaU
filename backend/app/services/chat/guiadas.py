"""Respuestas guiadas sin LLM para los temas más frecuentes (puro, sin E/S).

Por qué: las preguntas frecuentes («¿cómo publico?», «¿qué es Roomies?») son
la mayoría del tráfico. Responderlas con texto fijo tomado de la KB cuesta
cero llamadas al proveedor y no puede alucinar (el modelo llegó a decir que
un aviso «quedará disponible» sin pasar por moderación).

Cada tema tiene: documento de la KB del que sale el texto (máximo 3 frases,
sin nada que no esté en ese documento), botones propios y 2 preguntas
sugeridas que llevan a OTROS temas (así una sugerencia nunca devuelve la
misma respuesta).

Las preguntas de detalle («¿por qué...?», «¿cuántas fotos...?», «¿qué pasa
si...?») no usan la respuesta guiada: van a la KB y al modelo, que puede
contestar ese punto concreto.
"""
import re
from dataclasses import dataclass

from app.services.chat.rutas import ruta_permitida


@dataclass(frozen=True)
class Tema:
    clave: str
    doc: str
    disparador: re.Pattern
    texto: str
    acciones: tuple[dict, ...]
    sugerencias: tuple[str, ...]


def _accion(etiqueta: str, ruta: str) -> dict:
    return {"etiqueta": etiqueta, "ruta": ruta}


def _re(patron: str) -> re.Pattern:
    return re.compile(patron)


# El orden importa: lo más específico primero («mis publicaciones» antes que
# «publicar», «destacar» antes que «publicar»).
TEMAS: tuple[Tema, ...] = (
    Tema(
        "publicidad", "13-publicidad-destacados",
        _re(r"\b(?:destac\w*|publicit\w*|publicidad|patrocin\w*|promocion\w*)\b"),
        "Puedes destacar un aviso propio y activo desde la opción Publicitar: "
        "eliges el aviso, un plan de 7, 15 o 30 días y registras la referencia "
        "de tu pago. El pago se hace de forma manual y el equipo de AlojaU "
        "revisa y aprueba la solicitud antes de activar el destacado.",
        (_accion("Destacar un aviso", "/publicitar"),
         _accion("Mis publicaciones", "/mis-publicaciones")),
        ("¿Cómo renuevo mi publicación?", "¿Qué es el índice de confianza?")),
    Tema(
        "mis_publicaciones", "12-mis-publicaciones",
        _re(r"\bmis (?:publicaciones|avisos|anuncios)\b"
            r"|\b(?:renov\w*|renuev\w*|pausar|pauso|pausa|reactiv\w*)\b"),
        "En Mis publicaciones ves tus avisos con su estado: pendiente de "
        "revisión, activo, pausado o rechazado. Desde ahí puedes editarlos, "
        "pausarlos, reactivarlos, renovarlos o eliminarlos. Un aviso activo "
        "deja de aparecer en la búsqueda si pasan 30 días sin renovarlo.",
        (_accion("Mis publicaciones", "/mis-publicaciones"),
         _accion("Publicar un aviso", "/publicar")),
        ("¿Cómo destaco un aviso?", "¿Qué es el índice de confianza?")),
    Tema(
        "publicar", "11-publicar-aviso",
        _re(r"\b(?:publicar|publico|publica|publicas|publique|publiquen|"
            r"publicacion|anunciar|arrendar mi|poner en arriendo|"
            r"subir (?:un|mi) (?:aviso|anuncio|inmueble))\b"),
        "Publicas desde la opción Publicar en tres pasos: 1) información "
        "(título, descripción, tipo, canon, depósito y reglas de convivencia), "
        "2) ubicación (zona y un punto en el mapa) y 3) servicios y mínimo 3 "
        "fotos. Al enviarlo, el aviso pasa a revisión: un moderador lo aprueba "
        "antes de que los estudiantes lo vean.",
        (_accion("Publicar un aviso", "/publicar"),
         _accion("Mis publicaciones", "/mis-publicaciones")),
        ("¿Cómo renuevo mi publicación?", "¿Cómo destaco un aviso?")),
    Tema(
        "roomies", "10-roomies",
        _re(r"\b(?:room\w*|companer\w*|compatibilidad|compartir (?:apartamento|"
            r"vivienda|habitacion|arriendo))\b"),
        "Roomies sirve para encontrar otros estudiantes que buscan compañero "
        "de vivienda y ver qué tan bien podrían convivir contigo. Llenas tus "
        "preferencias de convivencia en tu perfil (aseo, sueño, invitados, "
        "mascotas, pagos y carácter) y la plataforma te muestra candidatos con "
        "un puntaje de compatibilidad de 0 a 100. Necesitas iniciar sesión "
        "como estudiante.",
        (_accion("Ir a Roomies", "/roomies"), _accion("Mi perfil", "/perfil")),
        ("¿Cómo edito mi perfil?", "¿Cómo guardo favoritos?")),
    Tema(
        "confianza", "02-confianza",
        _re(r"\b(?:indice|confianza|confiable|puntaje del aviso)\b"),
        "El índice de confianza va de 0 a 100 y se calcula con la completitud "
        "del anuncio (40 puntos), el teléfono verificado (20), las fotos (15), "
        "la vigencia (15) y la ausencia de reportes (10). Con 80 o más es "
        "confianza alta, de 50 a 79 media y menos de 50 básica. Es orientativo, "
        "no una garantía: verifica siempre en persona antes de pagar.",
        (_accion("Ir a la búsqueda", "/"),),
        ("¿Cómo reporto un aviso sospechoso?", "¿Cómo comparo avisos?")),
    Tema(
        "recuperar", "07-cuentas-recuperacion",
        _re(r"\b(?:olvid\w*|recuper\w*|restablec\w*)\b.{0,30}"
            r"\b(?:contrasena|clave|password|cuenta)\b"
            r"|\b(?:contrasena|clave|password)\b.{0,30}"
            r"\b(?:olvid\w*|recuper\w*|restablec\w*|cambi\w*)\b"),
        "Si olvidaste tu contraseña, usa la opción Recuperar en el inicio de "
        "sesión. Te llega un enlace de un solo uso y corta vigencia para crear "
        "una nueva.",
        (_accion("Recuperar contraseña", "/recuperar"),),
        ("¿Cómo edito mi perfil?", "¿Cómo funcionan las alertas?")),
    Tema(
        "alertas", "05-alertas-telegram",
        _re(r"\b(?:alerta\w*|notificacion\w*|campanita|telegram|avisame|"
            r"avisarme)\b"),
        "Puedes crear alertas con tus filtros (zona, precio o tipo) desde la "
        "página de Alertas; cuando se publique algo que coincida, te llega una "
        "notificación en la campanita. Si vinculas Telegram desde Mi perfil, "
        "también puedes verificar tu teléfono gratis y recibir avisos.",
        (_accion("Mis alertas", "/alertas"), _accion("Mi perfil", "/perfil")),
        ("¿Cómo funcionan los filtros?", "¿Cómo guardo favoritos?")),
    Tema(
        "favoritos", "04-favoritos-comparar",
        _re(r"\b(?:favorit\w*|comparar|compara|comparo|comparacion)\b"),
        "Puedes guardar avisos como favoritos desde el listado o el detalle "
        "para revisarlos después; se guardan en tu navegador. También puedes "
        "comparar dos o tres avisos lado a lado: precio, distancia, servicios "
        "y condiciones.",
        (_accion("Ver favoritos", "/favoritos"), _accion("Comparar", "/comparar")),
        ("¿Cómo creo una alerta?", "¿Qué es el índice de confianza?")),
    Tema(
        "perfil", "14-perfil-cuenta",
        _re(r"\b(?:perfil|foto de perfil|mis datos|cerrar sesion|sesiones)\b"),
        "En Mi perfil editas tus datos personales y tu foto, ves tu nivel de "
        "confianza y gestionas la seguridad de tu cuenta (contraseña y "
        "sesiones). Los estudiantes también completan ahí sus preferencias de "
        "convivencia para usar Roomies.",
        (_accion("Mi perfil", "/perfil"),),
        ("¿Qué es Roomies?", "¿Cómo recupero mi contraseña?")),
    Tema(
        "filtros", "03-filtros-busqueda",
        _re(r"\b(?:filtr\w*|busqueda|buscar|busco|busca|ordenar|ordeno)\b"),
        "En la búsqueda puedes filtrar por campus o ciudad, rango de precio, "
        "tipo de vivienda, servicios y texto libre, y combinar los filtros. "
        "Los resultados se ordenan por recientes, precio o distancia al campus.",
        (_accion("Ir a la búsqueda", "/"), _accion("Mis alertas", "/alertas")),
        ("¿Cómo creo una alerta?", "¿Qué es el índice de confianza?")),
)

TEMAS_POR_DOC = {t.doc: t for t in TEMAS}

SUGERENCIAS_INICIALES = (
    "¿Cómo publico un aviso?",
    "¿Qué es Roomies?",
    "¿Qué es el índice de confianza?",
)

# Preguntas de detalle: la respuesta guiada sería demasiado general.
_RE_DETALLE = re.compile(
    r"\b(?:por que|porque|cuant[oa]s?|cuando|calcula\w*|diferencia\w*|"
    r"que pasa si|sin (?:fotos|telefono|cuenta|sesion)|despues de|"
    r"cuesta|vale|precio de)\b")
_MAX_PALABRAS_GUIADA = 12


def tema_de(texto_plano: str) -> Tema | None:
    """Primer tema cuyo disparador aparece en el texto (ya plano y corregido)."""
    for tema in TEMAS:
        if tema.disparador.search(texto_plano):
            return tema
    return None


def tema_guiado(texto_plano: str) -> Tema | None:
    """Tema con respuesta guiada, o None si la pregunta pide un detalle."""
    if (not texto_plano or _RE_DETALLE.search(texto_plano)
            or len(texto_plano.split()) > _MAX_PALABRAS_GUIADA):
        return None
    return tema_de(texto_plano)


def acciones_de(tema: Tema) -> list[dict]:
    return [dict(a) for a in tema.acciones if ruta_permitida(a["ruta"])][:5]
