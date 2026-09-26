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


def _mock_imagenes(pub: dict) -> list:
    """Simula filas ImagenPublicacion desde fotos mock (ids/orden deterministas).

    BUG#1: antes devolvía imagenes: [] siempre, así que la portada mock no
    existía. Id virtual estable: pub_id*1000 + índice (1-based), orden = índice.
    Así fotos[0] == imagenes[0].url == portada en dev sin PG.
    """
    fotos = pub.get("fotos", []) or []
    try:
        base = int(pub.get("id", 0)) * 1000
    except Exception:
        base = 0
    return [{"id": base + i, "url": u, "orden": i} for i, u in enumerate(fotos, start=1)]


def mock_foto_ids(pub: dict) -> list[int]:
    """Ids virtuales de fotos mock (para DELETE/orden sin PG)."""
    return [im["id"] for im in _mock_imagenes(pub)]


def mock_to_out(pub: dict, campus_id: Optional[int] = None,
                mostrar_vistas: bool = True) -> dict:
    """Convierte dict mock a payload detalle (Haversine + Trust + alias compat).

    mostrar_vistas=False en lista/similares públicas (el contador es solo del
    dueño/admin por setting vistas_visibles_publico=false); True en mias y
    detalle propio. En dev sin PG el dueño SÍ ve su contador en /mias mock.
    """
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
        "barrio_texto": pub.get("barrio_texto"),
        "zona": pub.get("zona_nombre") or pub.get("barrio_texto"),
        "zona_nombre": pub.get("zona_nombre") or pub.get("barrio_texto"),
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
        # v15.2 paridad mock (sin ids de foto ni contador en memoria).
        "created_at": pub.get("fecha_publicacion"),
        "updated_at": pub.get("fecha_renovacion"),
        "vistas": (pub.get("vistas", 0) or 0) if mostrar_vistas else None,
        "imagenes": _mock_imagenes(pub),
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
    la portada sigue siendo fotos[0]. Soporta objetos ORM y dicts mock.
    """
    try:
        return sorted(list(imagenes or []), key=lambda i: (
            getattr(i, "orden", None) if not isinstance(i, dict)
            else i.get("orden", 0)
        ) or 0)
    except Exception:
        return list(imagenes or [])


def build_card(p, dist, trust: dict, zona_nombre, tel: Optional[str],
               mostrar_vistas: bool = True) -> dict:
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
        # v15.2 frescura + métricas (aditivos, sin romper contratos).
        "fecha_publicacion": p.fecha_publicacion,
        "created_at": p.fecha_publicacion,
        "updated_at": p.fecha_renovacion,
        "vistas": (getattr(p, "vistas", 0) or 0) if mostrar_vistas else None,
    }


def build_detail(p, reportes_activos: int, u, dist, campus_ref: Optional[dict] = None,
                 mostrar_vistas: bool = True) -> dict:
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
        # Oleada 2: coords para MapaZona modo aviso + deep-link (eran internas, ahora visibles).
        "latitud": float(p.latitud) if p.latitud is not None else None,
        "longitud": float(p.longitud) if p.longitud is not None else None,
        # 004 POIs: referencia resuelta con ?campus_id= (mapa dinámico del Detalle).
        "campus_ref": campus_ref,
        # v15.2 autoría + frescura + métricas + gestión multimedia (aditivos).
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
                   mostrar_vistas: bool = True) -> list:
    """Items GET /api/publicaciones desde agregados en memoria (sin queries)."""
    out = []
    for p in pubs:
        u = users_map.get(p.usuario_id)
        tel_ver = bool(u.telefono_verificado) if u else False
        trust = trust_for_row(p, reportes_map.get(p.id, 0), tel_ver)
        zona_nombre = _zona_display(p)
        tel = u.telefono_whatsapp if tel_ver and u else None
        out.append(build_card(p, dist_map.get(p.id) if campus_id else None, trust, zona_nombre, tel,
                              mostrar_vistas))
    return out


def filter_mock_pubs(pubs: List[dict], campus_id=None, precio_min=None, precio_max=None, tipo=None, servicios_ids=None, q=None, ciudad_id=None, ciudad_slug=None):
    """Filtros HU-001/002 + Fase 2 tokenizada + multiciudad sobre MOCK_PUBS (solo dev sin PG).

    - Tokeniza q, filtra stop-words ES, OR parcial con score (mayoría primero).
    - Busca en titulo, descripcion, zona_nombre, tipo (con sinónimos) y servicios.
    - ciudad_id/ciudad_slug filtran por mock ciudad_id (default 1 Popayán).
    """
    from app.services.haversine import haversine_m as _h
    from app.services.search import normalize_token, tokenize_query, tipo_canonico_para_token
    from app.services.ciudades import slugify
    import unicodedata

    def _norm(s: str) -> str:
        s = (s or "").lower()
        return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

    filtradas = [p for p in pubs if p["estado"] == "ACTIVO"]
    # Fase 4 multiciudad (mock): los pubs demo son ciudad_id 1 salvo que el dict lo indique.
    if ciudad_slug and not ciudad_id:
        wanted = slugify(ciudad_slug)
        # Mock solo conoce Popayán (id 1 / slug popayan).
        if wanted != "popayan":
            return []
        ciudad_id = 1
    if ciudad_id:
        filtradas = [p for p in filtradas if int(p.get("ciudad_id", 1)) == int(ciudad_id)]
    if campus_id:
        # Paridad con el trigger 004 (enlaza TODOS los lugares): si ningún pub
        # lista este lugar (p.ej. POI nuevo en mock), no se filtra por membresía;
        # se ordena por distancia a él igualmente.
        con_membresia = [p for p in filtradas if campus_id in p.get("campus_ids", [])]
        if con_membresia:
            filtradas = con_membresia
        if campus_id in MOCK_CAMPUS:
            c = MOCK_CAMPUS[campus_id]
            filtradas.sort(key=lambda p: _h(p["latitud"], p["longitud"], c["lat"], c["lng"]) if p.get("latitud") is not None and p.get("longitud") is not None else 999999)
    if precio_min is not None:
        filtradas = [p for p in filtradas if p["canon_mensual"] >= precio_min]
    if precio_max is not None:
        filtradas = [p for p in filtradas if p["canon_mensual"] <= precio_max]
    if tipo:
        filtradas = [p for p in filtradas if p["tipo_inmueble"] == tipo]
    if servicios_ids:
        filtradas = [p for p in filtradas if all(s in p.get("servicios_ids", []) for s in servicios_ids)]
    if q and q.strip():
        tokens = tokenize_query(q)
        if not tokens:
            return filtradas  # solo stop-words -> sin filtro de texto
        scored = []
        for p in filtradas:
            nt = _norm(p.get("titulo", ""))
            nd = _norm(p.get("descripcion", ""))
            nz = _norm(p.get("zona_nombre") or p.get("barrio_texto") or "")
            ns = _norm(" ".join(p.get("servicios", []) or []))
            ntipo = _norm(p.get("tipo_inmueble", "").replace("_", " "))
            haystacks = (nt, nd, nz, ns, ntipo)
            hits = 0
            for tok in tokens:
                ntok = normalize_token(tok)
                canon = tipo_canonico_para_token(tok)
                matched = any(ntok in h for h in haystacks)
                if not matched and canon:
                    if canon == "HABITACION":
                        matched = p.get("tipo_inmueble", "").startswith("HABITACION")
                    else:
                        matched = p.get("tipo_inmueble") == canon
                if matched:
                    hits += 1
            if hits > 0:
                # (-hits, id) => mayoría primero, determinista.
                scored.append((-hits, p.get("id", 0), p))
        scored.sort(key=lambda t: (t[0], t[1]))
        filtradas = [p for _, _, p in scored]
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
