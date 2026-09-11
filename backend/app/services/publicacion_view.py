"""Dicts respuesta AlojaU con alias compat (capa vista, sin SQL ni HTTP).
Uso: routers/publicaciones.py. Ej: build_card(p, dist, trust, zona, tel)."""
from typing import List, Optional
from urllib.parse import quote as urlquote

from app.fixtures.demo import MOCK_CAMPUS
from app.services.haversine import haversine_m
from app.services.trust import calcular_indice, dias_desde


def whatsapp_link(titulo: str, pub_id: int, tel: Optional[str]) -> Optional[str]:
    """URL wa.me solo si hay teléfono verificado."""
    if not tel:
        return None
    return f"https://wa.me/{tel}?text={urlquote(f'Hola, vi {titulo} (ID {pub_id}) en AlojaU y me interesa.')}"


def mock_to_out(pub: dict, campus_id: Optional[int] = None) -> dict:
    """Convierte dict mock a payload detalle (Haversine + Trust + alias compat)."""
    dist = None
    if campus_id and campus_id in MOCK_CAMPUS and pub.get("latitud") is not None and pub.get("longitud") is not None:
        c = MOCK_CAMPUS[campus_id]
        dist = haversine_m(pub["latitud"], pub["longitud"], c["lat"], c["lng"])
    dias_vig = dias_desde(pub.get("fecha_renovacion"))
    trust = calcular_indice(
        canon_mensual=pub.get("canon_mensual"),
        deposito_requerido=pub.get("deposito_requerido"),
        tipo_inmueble=pub.get("tipo_inmueble"),
        reglas_convivencia=pub.get("reglas_convivencia"),
        direccion_referencial=pub.get("direccion_referencial"),
        servicios_ids=pub.get("servicios_ids"),
        telefono_verificado=pub.get("telefono_verificado", False),
        num_fotos=len(pub.get("fotos", [])),
        dias_vigencia=dias_vig,
        reportes_activos=pub.get("reportes_activos", 0),
    )
    fotos = pub.get("fotos", [])
    tel = pub.get("telefono_whatsapp") if pub.get("telefono_verificado") else None
    return {
        "id": pub["id"],
        "titulo": pub["titulo"],
        "descripcion": pub.get("descripcion"),
        "tipo_inmueble": pub["tipo_inmueble"],
        "canon_mensual": pub["canon_mensual"],
        "canon": pub["canon_mensual"],
        "deposito": pub.get("deposito_requerido", 0),
        "deposito_requerido": pub.get("deposito_requerido", 0),
        "zona_barrio_id": pub["zona_barrio_id"],
        "zona": pub.get("zona_nombre"),
        "zona_nombre": pub.get("zona_nombre"),
        "direccion_referencial": pub["direccion_referencial"],
        "reglas": pub.get("reglas_convivencia"),
        "reglas_convivencia": pub.get("reglas_convivencia"),
        "estado": pub["estado"],
        "fecha_publicacion": pub.get("fecha_publicacion"),
        "fecha_renovacion": pub.get("fecha_renovacion"),
        "fecha_expiracion": pub.get("fecha_expiracion"),
        "servicios": pub.get("servicios", []),
        "servicios_ids": pub.get("servicios_ids", []),
        "fotos": fotos,
        "num_fotos": len(fotos),
        "distancia_geodesica_m": dist,
        "dist_m": dist,
        "campus_distancias": [{"campus_id": cid, "dist_m": haversine_m(pub["latitud"], pub["longitud"], MOCK_CAMPUS[cid]["lat"], MOCK_CAMPUS[cid]["lng"])} for cid in pub.get("campus_ids", []) if cid in MOCK_CAMPUS and pub.get("latitud") is not None] if pub.get("latitud") is not None else None,
        "indice_confianza": trust["indice"],
        "indice": trust["indice"],
        "desglose": trust["desglose"],
        "nivel": trust["nivel"],
        "nivel_confianza": trust["nivel"],
        "advertencia": trust["advertencia"],
        "advertencia_confianza": trust["advertencia"],
        "telefono_whatsapp": tel,
        "whatsapp_url": whatsapp_link(pub["titulo"], pub["id"], tel),
        "usuario_id": pub.get("usuario_id"),
        # Oleada 2: coords para MapaZona modo aviso + deep-link (eran internas, ahora visibles).
        "latitud": pub.get("latitud"),
        "longitud": pub.get("longitud"),
    }


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


def build_card(p, dist, trust: dict, zona_nombre, tel: Optional[str]) -> dict:
    """Item GET /api/publicaciones (canónicos + alias compat)."""
    return {
        "id": p.id, "titulo": p.titulo, "descripcion": p.descripcion,
        "tipo_inmueble": p.tipo_inmueble, "canon_mensual": float(p.canon_mensual), "canon": float(p.canon_mensual),
        "deposito_requerido": float(p.deposito_requerido),
        "zona_barrio_id": p.zona_barrio_id, "zona": zona_nombre, "zona_nombre": zona_nombre,
        "direccion_referencial": p.direccion_referencial,
        "reglas_convivencia": p.reglas_convivencia, "estado": p.estado,
        "fecha_renovacion": p.fecha_renovacion, "fecha_expiracion": p.fecha_expiracion,
        "servicios": [s.nombre for s in p.servicios], "servicios_ids": [s.id for s in p.servicios],
        "fotos": [im.url for im in p.imagenes], "num_fotos": len(p.imagenes),
        "distancia_geodesica_m": dist, "dist_m": dist,
        "indice_confianza": trust["indice"], "indice": trust["indice"], "desglose": trust["desglose"],
        "nivel_confianza": trust["nivel"], "nivel": trust["nivel"],
        "telefono_whatsapp": tel if tel else None,
        "usuario_id": p.usuario_id,
    }


def build_detail(p, reportes_activos: int, u, dist, campus_ref: Optional[dict] = None) -> dict:
    """Detalle GET /api/publicaciones/{id} (canónicos + alias compat)."""
    tel_ver = bool(u.telefono_verificado) if u else False
    trust = trust_for_row(p, reportes_activos, tel_ver)
    tel = u.telefono_whatsapp if tel_ver and u else None
    zona_nombre = p.zona.nombre if hasattr(p, "zona") and p.zona else "No informado"
    fotos = [im.url for im in p.imagenes]
    return {
        "id": p.id, "titulo": p.titulo, "descripcion": p.descripcion,
        "tipo_inmueble": p.tipo_inmueble, "canon_mensual": float(p.canon_mensual), "canon": float(p.canon_mensual),
        "deposito": float(p.deposito_requerido), "deposito_requerido": float(p.deposito_requerido),
        "zona_barrio_id": p.zona_barrio_id, "zona": zona_nombre, "zona_nombre": zona_nombre,
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
        # Oleada 2: coords para MapaZona modo aviso + deep-link (eran internas, ahora visibles).
        "latitud": float(p.latitud) if p.latitud is not None else None,
        "longitud": float(p.longitud) if p.longitud is not None else None,
        # 004 POIs: referencia resuelta con ?campus_id= (mapa dinámico del Detalle).
        "campus_ref": campus_ref,
    }


def cards_for_page(pubs, reportes_map: dict, users_map: dict, dist_map: dict, campus_id=None) -> list:
    """Items GET /api/publicaciones desde agregados en memoria (sin queries)."""
    out = []
    for p in pubs:
        u = users_map.get(p.usuario_id)
        tel_ver = bool(u.telefono_verificado) if u else False
        trust = trust_for_row(p, reportes_map.get(p.id, 0), tel_ver)
        zona_nombre = p.zona.nombre if hasattr(p, "zona") and p.zona else None
        tel = u.telefono_whatsapp if tel_ver and u else None
        out.append(build_card(p, dist_map.get(p.id) if campus_id else None, trust, zona_nombre, tel))
    return out


def filter_mock_pubs(pubs: List[dict], campus_id=None, precio_min=None, precio_max=None, tipo=None, servicios_ids=None, q=None):
    """Filtros HU-001/002 + Oleada 2 (q texto libre) sobre MOCK_PUBS (solo dev sin PG)."""
    from app.services.haversine import haversine_m as _h
    import unicodedata

    def _norm(s: str) -> str:
        s = (s or "").lower()
        return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

    filtradas = [p for p in pubs if p["estado"] == "ACTIVO"]
    if campus_id:
        filtradas = [p for p in filtradas if campus_id in p.get("campus_ids", [])]
        filtradas.sort(key=lambda p: _h(p["latitud"], p["longitud"], MOCK_CAMPUS[campus_id]["lat"], MOCK_CAMPUS[campus_id]["lng"]) if p.get("latitud") is not None and p.get("longitud") is not None else 999999)
    if precio_min is not None:
        filtradas = [p for p in filtradas if p["canon_mensual"] >= precio_min]
    if precio_max is not None:
        filtradas = [p for p in filtradas if p["canon_mensual"] <= precio_max]
    if tipo:
        filtradas = [p for p in filtradas if p["tipo_inmueble"] == tipo]
    if servicios_ids:
        filtradas = [p for p in filtradas if all(s in p.get("servicios_ids", []) for s in servicios_ids)]
    if q and q.strip():
        nq = _norm(q.strip())
        # Relevancia simple: empieza-por-título > contiene-en-título > contiene-en-descripción.
        scored = []
        for p in filtradas:
            nt, nd = _norm(p.get("titulo", "")), _norm(p.get("descripcion", ""))
            if nt.startswith(nq):
                scored.append((0, p))
            elif nq in nt:
                scored.append((1, p))
            elif nq in nd:
                scored.append((2, p))
        scored.sort(key=lambda t: t[0])
        filtradas = [p for _, p in scored]
    return filtradas


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
