"""Dicts respuesta AlojaU con alias compat (capa vista, sin SQL ni HTTP).
Uso: routers/publicaciones.py. Ej: build_card(p, dist, trust, zona, tel)."""
from typing import List, Optional
from urllib.parse import quote as urlquote

from app.services.trust import calcular_indice, dias_desde


def whatsapp_link(titulo: str, pub_id: int, tel: Optional[str]) -> Optional[str]:
    """URL wa.me solo si hay teléfono verificado."""
    if not tel:
        return None
    return f"https://wa.me/{tel}?text={urlquote(f'Hola, vi {titulo} (ID {pub_id}) en AlojaU y me interesa.')}"


def initial_trust(payload, telefono_verificado: bool) -> dict:
    """Índice inicial al crear (vigencia 0, sin reportes)."""
    return calcular_indice(
        canon_mensual=float(payload.canon_mensual),
        deposito_requerido=float(payload.deposito_requerido),
        tipo_inmueble=payload.tipo_inmueble,
        reglas_convivencia=payload.reglas_convivencia,
        direccion_referencial=payload.direccion_referencial,
        servicios_ids=payload.servicios_ids,
        telefono_verificado=telefono_verificado,
        num_fotos=len(payload.fotos),
        dias_vigencia=0,
        reportes_activos=0,
    )


def _zona_display(p) -> str | None:
    """Zona del catálogo o barrio libre (v10); None si no hay ninguno."""
    z = getattr(p, "zona", None)
    nombre = z.nombre if z is not None and getattr(z, "nombre", None) else None
    return nombre or getattr(p, "barrio_texto", None) or None


def trust_for_row(p, reportes_activos: int, tel_ver: bool) -> dict:
    """Índice para una fila ORM (lista o detalle)."""
    return calcular_indice(
        canon_mensual=float(p.canon_mensual),
        deposito_requerido=float(p.deposito_requerido),
        tipo_inmueble=p.tipo_inmueble,
        reglas_convivencia=p.reglas_convivencia,
        direccion_referencial=p.direccion_referencial,
        servicios_ids=[s.id for s in p.servicios],
        telefono_verificado=tel_ver,
        num_fotos=len(p.imagenes),
        dias_vigencia=dias_desde(p.fecha_renovacion),
        reportes_activos=reportes_activos,
    )


def _ordenadas(imagenes) -> list:
    """Fotos ORM en orden de portada (orden=1 primero).

    BUG#1: el eager-load ya viene ordenado por la relationship, pero se
    re-ordena aquí defensivamente: si algún query futuro olvida el order_by,
    la portada sigue siendo fotos[0]. Recibe objetos ORM.
    """
    try:
        return sorted(list(imagenes or []), key=lambda i: (
            getattr(i, "orden", None) if not isinstance(i, dict)
            else i.get("orden", 0)
        ) or 0)
    except Exception:
        return list(imagenes or [])


def build_card(p, dist, trust: dict, zona_nombre, tel: Optional[str],
               mostrar_vistas: bool = True, destacado: bool = False,
               destacado_vence=None) -> dict:
    """Item GET /api/publicaciones (canónicos + alias compat).

    fotos[0] es siempre la portada (orden=1): ver _ordenadas/BUG#1.
    """
    imgs = _ordenadas(p.imagenes)
    return {
        "id": p.id, "titulo": p.titulo, "descripcion": p.descripcion,
        "tipo_inmueble": p.tipo_inmueble, "canon_mensual": float(p.canon_mensual), "canon": float(p.canon_mensual),
        "deposito_requerido": float(p.deposito_requerido),
        "zona_barrio_id": p.zona_barrio_id, "barrio_texto": getattr(p, "barrio_texto", None),
        "zona": zona_nombre, "zona_nombre": zona_nombre,
        "direccion_referencial": p.direccion_referencial,
        "reglas_convivencia": p.reglas_convivencia, "estado": p.estado,
        "fecha_renovacion": p.fecha_renovacion, "fecha_expiracion": p.fecha_expiracion,
        "servicios": [s.nombre for s in p.servicios], "servicios_ids": [s.id for s in p.servicios],
        "fotos": [im.url for im in imgs], "num_fotos": len(imgs),
        "distancia_geodesica_m": dist, "dist_m": dist,
        "indice_confianza": trust["indice"], "indice": trust["indice"], "desglose": trust["desglose"],
        "nivel_confianza": trust["nivel"], "nivel": trust["nivel"],
        "telefono_whatsapp": tel if tel else None,
        "usuario_id": p.usuario_id,
        # Publicidad v1: badge "Destacado" (el router resuelve vigencia).
        "destacado": bool(destacado),
        "destacado_vence": destacado_vence,
        # Frescura + métricas (aditivos, sin romper contratos).
        "fecha_publicacion": p.fecha_publicacion,
        "created_at": p.fecha_publicacion,
        "updated_at": p.fecha_renovacion,
        "vistas": (getattr(p, "vistas", 0) or 0) if mostrar_vistas else None,
    }


def build_detail(p, reportes_activos: int, u, dist, campus_ref: Optional[dict] = None,
                 mostrar_vistas: bool = True, destacado: bool = False,
                 destacado_vence=None) -> dict:
    """Detalle GET /api/publicaciones/{id} (canónicos + alias compat).

    BUG#1: fotos e imagenes comparten el mismo orden (portada primero).
    """
    tel_ver = bool(u.telefono_verificado) if u else False
    trust = trust_for_row(p, reportes_activos, tel_ver)
    tel = u.telefono_whatsapp if tel_ver and u else None
    zona_nombre = _zona_display(p) or "No informado"
    imgs = _ordenadas(p.imagenes)
    fotos = [im.url for im in imgs]
    return {
        "id": p.id, "titulo": p.titulo, "descripcion": p.descripcion,
        "tipo_inmueble": p.tipo_inmueble, "canon_mensual": float(p.canon_mensual), "canon": float(p.canon_mensual),
        "deposito": float(p.deposito_requerido), "deposito_requerido": float(p.deposito_requerido),
        "zona_barrio_id": p.zona_barrio_id, "barrio_texto": getattr(p, "barrio_texto", None),
        "zona": zona_nombre, "zona_nombre": zona_nombre,
        "direccion_referencial": p.direccion_referencial, "reglas": p.reglas_convivencia,
        "reglas_convivencia": p.reglas_convivencia,
        "estado": p.estado, "fecha_renovacion": p.fecha_renovacion, "fecha_expiracion": p.fecha_expiracion,
        "servicios": [s.nombre for s in p.servicios], "servicios_ids": [s.id for s in p.servicios],
        "fotos": fotos, "num_fotos": len(fotos),
        "distancia_geodesica_m": dist, "dist_m": dist,
        "indice_confianza": trust["indice"], "indice": trust["indice"], "desglose": trust["desglose"],
        "nivel": trust["nivel"], "nivel_confianza": trust["nivel"],
        "advertencia": trust["advertencia"], "telefono_whatsapp": tel,
        "whatsapp_url": whatsapp_link(p.titulo, p.id, tel),
        # Publicidad v1: banner vigencia (el router resuelve vigencia).
        "destacado": bool(destacado),
        "destacado_vence": destacado_vence,
        # Coords para MapaZona modo aviso + deep-link (eran internas, ahora visibles).
        "latitud": float(p.latitud) if p.latitud is not None else None,
        "longitud": float(p.longitud) if p.longitud is not None else None,
        # 004 POIs: referencia resuelta con ?campus_id= (mapa dinámico del Detalle).
        "campus_ref": campus_ref,
        # Autoría + frescura + métricas + gestión multimedia (aditivos).
        "usuario_id": p.usuario_id,
        "fecha_publicacion": p.fecha_publicacion,
        "created_at": p.fecha_publicacion,
        "updated_at": p.fecha_renovacion,
        "vistas": (getattr(p, "vistas", 0) or 0) if mostrar_vistas else None,
        "imagenes": [
            {"id": im.id, "url": im.url, "orden": im.orden}
            for im in imgs
        ],
    }


def cards_for_page(pubs, reportes_map: dict, users_map: dict, dist_map: dict, campus_id=None,
                   mostrar_vistas: bool = True, destacados_map: Optional[dict] = None) -> list:
    """Items GET /api/publicaciones desde agregados en memoria (sin queries)."""
    out = []
    for p in pubs:
        u = users_map.get(p.usuario_id)
        tel_ver = bool(u.telefono_verificado) if u else False
        trust = trust_for_row(p, reportes_map.get(p.id, 0), tel_ver)
        zona_nombre = _zona_display(p)
        tel = u.telefono_whatsapp if tel_ver and u else None
        info = (destacados_map or {}).get(p.id)
        out.append(build_card(p, dist_map.get(p.id) if campus_id else None, trust, zona_nombre, tel,
                              mostrar_vistas, info is not None,
                              info["vence"] if info else None))
    return out


def parse_servicios_param(servicios: Optional[str]) -> Optional[List[int]]:
    """Parsea ?servicios=1,3 (400 si formato/rango inválido)."""
    from fastapi import HTTPException

    if not servicios:
        return None
    if len(servicios) > 50:
        raise HTTPException(status_code=400, detail="servicios parámetro demasiado largo")
    try:
        ids = [int(s.strip()) for s in servicios.split(",") if s.strip()]
        if len(ids) > 10:
            raise HTTPException(status_code=400, detail="máximo 10 servicios")
        for sid in ids:
            if sid < 1 or sid > 1000:
                raise HTTPException(status_code=400, detail=f"servicio_id {sid} fuera de rango")
        return ids
    except ValueError:
        raise HTTPException(status_code=400, detail="servicios debe ser lista de ints coma separada")
