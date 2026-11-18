"""Detección de intención del mensaje por reglas (puro: sin LLM, red ni E/S).

Categorías: saludo, agradecimiento, despedida, ayuda_general, inyeccion,
dato_sensible, accion_no_permitida, fuera_de_tema y consulta. El orden de
evaluación importa: las defensas van antes que los temas y solo `consulta`
llega a la base de conocimiento y al LLM.
"""
import re

from app.services.chat.normalizar import plano

SALUDO = "saludo"
AGRADECIMIENTO = "agradecimiento"
DESPEDIDA = "despedida"
AYUDA_GENERAL = "ayuda_general"
INYECCION = "inyeccion"
DATO_SENSIBLE = "dato_sensible"
ACCION_NO_PERMITIDA = "accion_no_permitida"
FUERA_DE_TEMA = "fuera_de_tema"
CONSULTA = "consulta"

CATEGORIAS = (SALUDO, AGRADECIMIENTO, DESPEDIDA, AYUDA_GENERAL, INYECCION,
              DATO_SENSIBLE, ACCION_NO_PERMITIDA, FUERA_DE_TEMA, CONSULTA)

_SALUDOS = (r"hola+|hey|hi|buenas|buenos dias|buenas tardes|buenas noches|"
            r"que mas|quiubo|que hubo|saludos|bendiciones")
_COLETILLA = (r"hola+|hey|buenas|buenos dias|buenas tardes|buenas noches|"
              r"como estas|como esta|que tal|que mas|quiubo|que hubo|saludos|"
              r"alojau|equipo|a todos|todos|parce|amigo|amiga")
_RE_SALUDO = re.compile(rf"^(?:{_SALUDOS})(?: (?:{_COLETILLA}))*$")
_RE_SALUDO_PREFIJO = re.compile(rf"^(?:{_SALUDOS})\s+")

_RE_AGRADECIMIENTO = re.compile(
    r"^(?:(?:muchas|mil|muchisimas|infinitas) )?gracias"
    r"(?: (?:por (?:todo|la ayuda|tu ayuda|responder)|totales|parce|amigo))?$"
    r"|^(?:te )?agradezco(?: (?:mucho|bastante|todo))?$"
    r"|^muy amable$")

_RE_DESPEDIDA = re.compile(
    r"^(?:adios|chao|chau|bye|hasta (?:luego|pronto|manana|la vista)|"
    r"nos vemos|buen dia|feliz dia|que tengas (?:buen dia|buena noche))$")

_RE_AYUDA_GENERAL = re.compile(
    r"^(?:ayuda|ayudame|necesito ayuda|me ayudas|"
    r"(?:que|en que) (?:me )?(?:puedes|podrias|sabes) "
    r"(?:hacer|ayudar(?:me)?)|en que (?:me )?ayudas|"
    r"para que (?:sirves|funcionas|estas)|quien eres|que eres|que haces|"
    r"como funcionas|que sabes hacer|"
    r"que informacion (?:tienes|me puedes dar)|"
    r"de que se trata (?:la aplicacion|alojau|esto))$")

# Inyección: cambio de rol, extracción del prompt o marcadores de sistema.
# «reglas/instrucciones de convivencia» es contenido legítimo de la KB, así
# que solo cuentan cuando apuntan a los del sistema.
_MARCADOR_SISTEMA = (
    r"(?:tus (?:instrucciones|reglas|indicaciones)"
    r"|(?:tus )?(?:instrucciones|reglas|indicaciones) "
    r"(?:internas|del sistema|originales|de tu sistema)"
    r"|prompt|mensaje de sistema)")
_RE_INYECCION = re.compile(
    r"\b(?:ignora|ignore|olvida|omite|descarta|saltate)\b.{0,40}"
    + _MARCADOR_SISTEMA
    + r"|\b(?:muestra\w*|revela\w*|repite\w*|imprime\w*|ensena\w*|dime)\b"
    r".{0,40}"
    + _MARCADOR_SISTEMA
    + r"|\b(?:eres ahora|ahora eres|actua como|haz de cuenta|finjamos que|"
    r"modo (?:desarrollador|dios|admin)|jailbreak|"
    r"prompt injection|inyeccion de prompt)\b"
    r"|\b(?:actua como|eres|soy|modo|habla como) dan\b|^dan$"
    r"|(?:^| )system(?: |$)"
    r"|\b(?:cambia|cambiar|asume|toma)\b.{0,30}\b(?:rol|papel|personalidad)\b"
    r"|\bignore\b.{0,40}\b(?:previous|all|your)\b"
    r".{0,40}\b(?:instructions|rules)\b")

# Datos que el usuario nunca debe compartir por el chat.
_RE_DATO_FUERTE = re.compile(
    r"\b(?:cvv|cvc|otp|codigo de verificacion|clave bancaria|"
    r"clave de la tarjeta|numero de (?:mi |la )?tarjeta|mi tarjeta|"
    r"tarjeta de (?:credito|debito)|numero de cedula|"
    r"cedula de ciudadania|documento de identidad|mi cedula|"
    r"pin de la tarjeta)\b")
_RE_CLAVE = re.compile(r"\b(?:contrasena|password|clave|pin)\b")
_RE_RECUPERACION = re.compile(
    r"\b(?:olvid|recuper|restablec|cambiar|cambio|actualiz|donde)\w*\b")

# Acciones que el bot no ejecuta: solo explica y redirige.
_RE_ACCION_FUERTE = re.compile(
    r"\b(?:publicame|publicamelo|publiquenme|publiqueme|"
    r"publica (?:mi|el|un) (?:aviso|anuncio|inmueble|apartamento)|"
    r"sube (?:mi|el) aviso|"
    r"contacta (?:al|a la|a el|con el|con la)|contactalo|contactala|"
    r"escribele al|llamalo|"
    r"reserva(?:me|la|lo|una)?\b|haz(?:me)? (?:la|una) reserva|"
    r"borra (?:mi|la) cuenta|elimina (?:mi|la) cuenta|"
    r"desactiva (?:mi|la) cuenta|"
    r"paga(?:le|me)? (?:el|la|mi|los|las)|haz el pago|"
    r"cambia(?:me)? el precio|modifica(?:me)? el precio|"
    r"baja(?:me)? el precio|"
    r"elimina (?:mi|el) aviso|borra (?:mi|el) aviso)\b")
_RE_ACCION_INICIAL = re.compile(
    r"^(?:publicame|publica|paga|contacta|borra|elimina|cambia|reserva)\b")
_RE_PREGUNTA_INICIAL = re.compile(
    r"^(?:como|cuanto|cuanta|cuantos|donde|que|puedo|se puede|debo|hay|"
    r"es posible)\b")

# Temas ajenos a AlojaU (se evalúan después de las defensas).
_RE_FUERA_DE_TEMA = re.compile(
    r"\b(?:clima (?:de )?(?:hoy|manana)|pronostico|va a llover|llovera|"
    r"temperatura (?:de )?(?:hoy|manana)|"
    r"futbol|partido|deportes?|gol|liga|champions|mundial|"
    r"recetas?|cocinar|ingredientes|arepas|postre|"
    r"politica|presidente|elecciones|congreso|alcalde|"
    r"ecuacion|derivada|calculo integral|integral definida|integrales|"
    r"algebra|trigonometria|matematicas?|"
    r"tarea de (?:matematicas|fisica|quimica)|"
    r"programacion|python|javascript|html|css|algoritmo|codigo|"
    r"chiste|cancion|letra de (?:una )?cancion)\b")

# Temas de la plataforma que comparten palabras con los anteriores.
_RE_TEMA_ALOJAU = re.compile(
    r"\b(?:privacidad|tratamiento de datos|terminos|condiciones|"
    r"datos personales|alojau)\b")


def _es_dato_sensible(texto: str) -> bool:
    if _RE_DATO_FUERTE.search(texto):
        return True
    # «olvidé mi contraseña» es una consulta legítima, no un dato compartido.
    return bool(_RE_CLAVE.search(texto)
                and not _RE_RECUPERACION.search(texto))


def _es_accion_no_permitida(texto: str) -> bool:
    if _RE_ACCION_INICIAL.match(texto):
        return True
    if not _RE_ACCION_FUERTE.search(texto):
        return False
    # «¿Cómo público un aviso?» pide explicación, no ejecución.
    return not (_RE_PREGUNTA_INICIAL.match(texto)
                and not _RE_ACCION_INICIAL.match(texto))


def _quitar_saludo(texto: str) -> str:
    """Quita un saludo inicial para clasificar lo que viene después."""
    return _RE_SALUDO_PREFIJO.sub("", texto, count=1).strip()


def detectar_intencion(mensaje: str) -> str:
    """Categoría del mensaje ya normalizado (texto libre del cliente)."""
    texto = plano(mensaje)
    if not texto:
        return CONSULTA
    if _RE_INYECCION.search(texto):
        return INYECCION
    if _es_dato_sensible(texto):
        return DATO_SENSIBLE
    if _es_accion_no_permitida(texto):
        return ACCION_NO_PERMITIDA
    if _RE_SALUDO.fullmatch(texto):
        return SALUDO
    # «Hola, ¿qué puedes hacer?»: se clasifica la pregunta, no el saludo.
    texto = _quitar_saludo(texto)
    if not texto or _RE_SALUDO.fullmatch(texto):
        return SALUDO
    if _RE_AGRADECIMIENTO.fullmatch(texto):
        return AGRADECIMIENTO
    if _RE_DESPEDIDA.fullmatch(texto):
        return DESPEDIDA
    if _RE_AYUDA_GENERAL.fullmatch(texto):
        return AYUDA_GENERAL
    if (_RE_FUERA_DE_TEMA.search(texto)
            and not _RE_TEMA_ALOJAU.search(texto)):
        return FUERA_DE_TEMA
    return CONSULTA
