"""Tools del chatbot (allowlist cerrada, solo lectura, salida recortada).

Punto de entrada: `ejecutar_tool(db, nombre, argumentos)`:
1. Rechaza nombres fuera de `TOOLS_ALLOWLIST` (evento de seguridad).
2. Valida argumentos con Pydantic (`extra="forbid"`); lo inválido se rechaza
   sin tocar la BD.
3. Ejecuta contra `readonly_queries` (vistas chat_v_*) y devuelve datos ya
   RECORTADOS para el modelo: campos permitidos, textos truncados, máx. 5
   resultados en búsqueda. Nada de PII (las vistas no la tienen).

Reutiliza SOLO lógica pura: `tokenize_query` (vía readonly), `trust`
(cálculo + disclaimer) y `faq` (retrieval en memoria).
"""
from pydantic import ValidationError

from app.services.chat import readonly_queries as ro
from app.services.chat.faq import buscar_en_faq
from app.services.chat.schemas import ESQUEMAS_TOOL, TOOLS_ALLOWLIST
from app.services.trust import DISCLAIMER, calcular_indice, dias_desde

# Recortes de salida hacia el modelo (condición 4 del plan aprobado).
_MAX_RESULTADOS = 5
_TITULO_MAX = 150
_DESCRIPCION_MAX = 600
_REGLAS_MAX = 300
_DIRECCION_MAX = 200


class ToolRechazada(Exception):
    """Tool inexistente o argumentos inválidos (se registra sin contenido)."""


def _num(valor, default=0.0) -> float:
    try:
        return float(valor if valor is not None else default)
    except (TypeError, ValueError):
        return float(default)


def _texto(valor, tope: int) -> str:
    return str(valor or "")[:tope]


async def _trust_de_fila(db, fila: dict) -> dict:
    """Índice + nivel desde insumos públicos de la vista (sin PII)."""
    servs = await ro.servicios_de(db, fila["id"])
    return calcular_indice(
        canon_mensual=_num(fila.get("canon_mensual")),
        deposito_requerido=_num(fila.get("deposito_requerido")),
        tipo_inmueble=str(fila.get("tipo_inmueble") or ""),
        reglas_convivencia=str(fila.get("reglas_convivencia") or ""),
        direccion_referencial=str(fila.get("direccion_referencial") or ""),
        servicios_ids=[s["servicio_id"] for s in servs],
        titulo=_texto(fila.get("titulo"), _TITULO_MAX),
        descripcion=_texto(fila.get("descripcion"), _DESCRIPCION_MAX),
        telefono_verificado=bool(fila.get("tiene_telefono")),
        num_fotos=int(fila.get("num_fotos") or 0),
        dias_vigencia=dias_desde(fila.get("fecha_renovacion")),
        reportes_activos=int(fila.get("num_reportes_activos") or 0),
    )


def _resumen_fila(fila: dict, trust: dict | None = None,
                  distancia_m: int | None = None) -> dict:
    return {
        "id": int(fila["id"]),
        "titulo": _texto(fila.get("titulo"), _TITULO_MAX),
        "tipo_inmueble": str(fila.get("tipo_inmueble") or ""),
        "canon_mensual": _num(fila.get("canon_mensual")),
        "zona_nombre": str(fila.get("zona_nombre") or ""),
        "ciudad_nombre": str(fila.get("ciudad_nombre") or ""),
        "distancia_m": distancia_m,
        "tiene_telefono": bool(fila.get("tiene_telefono")),
        "num_fotos": int(fila.get("num_fotos") or 0),
        "indice_confianza": (trust or {}).get("indice"),
        "nivel_confianza": (trust or {}).get("nivel"),
    }


async def tool_buscar_publicaciones(db, args: dict) -> dict:
    from app.services.chat.schemas import BuscarArgs
    a = BuscarArgs(**args)
    filas = await ro.buscar_publicaciones(
        db, q=a.q, campus_id=a.campus_id, ciudad_id=a.ciudad_id,
        precio_min=a.precio_min, precio_max=a.precio_max, tipo=a.tipo,
        servicio_ids=tuple(a.servicio_ids or ()), ordenar=a.ordenar,
        limit=_MAX_RESULTADOS, offset=0)
    distancias: dict[int, int | None] = {}
    if a.campus_id:
        distancias = await ro.distancias_de(
            db, [f["id"] for f in filas], a.campus_id)
    salida = []
    for fila in filas[:_MAX_RESULTADOS]:
        trust = await _trust_de_fila(db, fila)
        salida.append(_resumen_fila(
            fila, trust, distancias.get(int(fila["id"]))))
    return {"resultados": salida, "total_mostrados": len(salida)}


async def tool_obtener_publicacion(db, args: dict) -> dict:
    from app.services.chat.schemas import PublicacionArgs
    a = PublicacionArgs(**args)
    fila = await ro.obtener_publicacion(db, a.pub_id)
    if not fila:
        return {"encontrada": False}
    trust = await _trust_de_fila(db, fila)
    servs = await ro.servicios_de(db, a.pub_id)
    fotos = await ro.fotos_de(db, a.pub_id, limit=10)
    return {
        "encontrada": True,
        "id": int(fila["id"]),
        "titulo": _texto(fila.get("titulo"), _TITULO_MAX),
        "descripcion": _texto(fila.get("descripcion"), _DESCRIPCION_MAX),
        "tipo_inmueble": str(fila.get("tipo_inmueble") or ""),
        "canon_mensual": _num(fila.get("canon_mensual")),
        "deposito_requerido": _num(fila.get("deposito_requerido")),
        "reglas_convivencia": _texto(fila.get("reglas_convivencia"), _REGLAS_MAX),
        "direccion_referencial": _texto(
            fila.get("direccion_referencial"), _DIRECCION_MAX),
        "zona_nombre": str(fila.get("zona_nombre") or ""),
        "ciudad_nombre": str(fila.get("ciudad_nombre") or ""),
        "servicios": [s["servicio_nombre"] for s in servs][:20],
        "portada": (fotos[0]["url"] if fotos else None),
        "num_fotos": int(fila.get("num_fotos") or 0),
        "tiene_telefono": bool(fila.get("tiene_telefono")),
        "indice_confianza": trust.get("indice"),
        "nivel_confianza": trust.get("nivel"),
        "advertencia": str(trust.get("advertencia") or ""),
    }


async def tool_listar_catalogos(db, args: dict) -> dict:
    from app.services.chat.schemas import CatalogoArgs
    a = CatalogoArgs(**args)
    if a.catalogo == "campus":
        filas = await ro.listar_campus(db, limit=20)
        return {"campus": [
            {"id": f["id"], "institucion": _texto(f.get("institucion"), 150),
             "nombre_sede": _texto(f.get("nombre_sede"), 150),
             "categoria": f.get("categoria")} for f in filas]}
    if a.catalogo == "ciudades":
        return {"ciudades": await ro.listar_ciudades(db)}
    if a.catalogo == "zonas":
        filas = await ro.listar_zonas(db, ciudad_id=a.ciudad_id, limit=50)
        return {"zonas": [
            {"id": f["id"], "nombre": _texto(f.get("nombre"), 120)}
            for f in filas]}
    if a.catalogo == "tipos":
        return {"tipos": await ro.listar_tipos(db)}
    filas = await ro.listar_servicios(db)
    return {"servicios": [
        {"id": f["id"], "nombre": _texto(f.get("nombre"), 80)} for f in filas]}


async def tool_explicar_indice_confianza(db, args: dict) -> dict:
    from app.services.chat.schemas import ConfianzaArgs
    a = ConfianzaArgs(**args)
    fila = await ro.obtener_publicacion(db, a.pub_id)
    if not fila:
        return {"encontrada": False, "disclaimer": DISCLAIMER}
    trust = await _trust_de_fila(db, fila)
    return {
        "encontrada": True,
        "id": int(fila["id"]),
        "indice": trust.get("indice"),
        "nivel": trust.get("nivel"),
        "desglose": trust.get("desglose"),
        "disclaimer": DISCLAIMER,
    }


async def tool_buscar_en_faq(db, args: dict) -> dict:
    from app.services.chat.schemas import FaqArgs
    a = FaqArgs(**args)
    return {"fragmentos": buscar_en_faq(a.pregunta, tope=3)}


_EJECUTORES = {
    "buscar_publicaciones": tool_buscar_publicaciones,
    "obtener_publicacion": tool_obtener_publicacion,
    "listar_catalogos": tool_listar_catalogos,
    "explicar_indice_confianza": tool_explicar_indice_confianza,
    "buscar_en_faq": tool_buscar_en_faq,
}


async def ejecutar_tool(db, nombre: str, argumentos: dict) -> dict:
    """Ejecuta una tool validada. Rechaza lo demás sin efectos."""
    if nombre not in TOOLS_ALLOWLIST or nombre not in _EJECUTORES:
        raise ToolRechazada(f"tool no permitida: {nombre}")
    esquema = ESQUEMAS_TOOL[nombre]
    try:
        esquema(**(argumentos if isinstance(argumentos, dict) else {}))
    except ValidationError:
        raise ToolRechazada(f"argumentos inválidos para {nombre}")
    return await _EJECUTORES[nombre](db, argumentos)
