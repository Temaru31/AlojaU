"""Validación de los datos de perfil: teléfono, preferencias JSONB y foto."""
import re

from fastapi import HTTPException


def normalizar_telefono(raw: str | None) -> str | None:
    """E.164 en dígitos sin '+' (canónico AlojaU, compatible wa.me y CHECK).

    - ''/None -> None (sin vincular; publicar lo exigirá con 400).
    - 10 dígitos -> prefijo 57 (Colombia); con 57 al inicio se conserva.
    - Retorna None si no quedan 7-15 dígitos (el caller responde 422).
    Desvío documentado de E.164 estricto ('+'): el '+' rompería los enlaces
    https://wa.me/ existentes y cambiaría todas las respuestas API.
    """
    if raw is None:
        return None
    d = re.sub(r"\D", "", str(raw))
    if not d:
        return None
    if len(d) == 10:
        d = "57" + d
    if not (7 <= len(d) <= 15):
        return None
    return d


PREFIJOS_PREFERENCIAS = ("filtros.", "roomie.", "notis.")
MAX_PREFERENCIAS_BYTES = 4096
MAX_PREFERENCIAS_CLAVES = 30
MAX_PREFERENCIAS_PROFUNDIDAD = 3


def _profundidad(obj, nivel=1) -> int:
    if isinstance(obj, dict) and obj:
        return max(_profundidad(v, nivel + 1) for v in obj.values())
    if isinstance(obj, list) and obj:
        return max(_profundidad(v, nivel + 1) for v in obj)
    return nivel


def validar_preferencias(prefs) -> dict:
    """Sanea preferencias JSONB: namespaces, tamaño ~4KB, tipos planos.

    Lanza HTTPException 422 si viola el contrato. Nunca decide AuthZ.
    """
    import json as _json
    if prefs is None:
        return {}
    if not isinstance(prefs, dict):
        raise HTTPException(status_code=422, detail="preferencias debe ser un objeto JSON")
    if len(prefs) > MAX_PREFERENCIAS_CLAVES:
        raise HTTPException(status_code=422, detail="Demasiadas preferencias (máx 30)")
    for k, v in prefs.items():
        if not isinstance(k, str) or not k.startswith(PREFIJOS_PREFERENCIAS):
            raise HTTPException(
                status_code=422,
                detail=f"Preferencia no permitida: '{k}' (usa filtros.* roomie.* notis.*)",
            )
        # Listas planas (punto 3 del PDF: rasgos positivos/negativos).
        if isinstance(v, (list, tuple)):
            if len(v) > 20:
                raise HTTPException(status_code=422, detail=f"Lista muy larga en '{k}' (máx 20)")
            for item in v:
                if not isinstance(item, (bool, int, float, str, type(None))):
                    raise HTTPException(status_code=422, detail=f"Valor no permitido en '{k}'")
                if isinstance(item, str) and len(item) > 200:
                    raise HTTPException(status_code=422, detail=f"Valor muy largo en '{k}' (máx 200)")
            continue
        if not isinstance(v, (bool, int, float, str, type(None))):
            raise HTTPException(status_code=422, detail=f"Valor no permitido en '{k}'")
        if isinstance(v, str) and len(v) > 200:
            raise HTTPException(status_code=422, detail=f"Valor muy largo en '{k}' (máx 200)")
    if _profundidad(prefs) > MAX_PREFERENCIAS_PROFUNDIDAD:
        raise HTTPException(status_code=422, detail="Preferencias demasiado anidadas")
    try:
        if len(_json.dumps(prefs, ensure_ascii=False).encode("utf-8")) > MAX_PREFERENCIAS_BYTES:
            raise HTTPException(status_code=422, detail="Preferencias exceden 4 KB")
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Preferencias no serializables")
    return dict(prefs)


def validar_foto_url(url: str | None) -> str | None:
    """Avatar: None/'' -> None; exige https:// estricto (anti-XSS en <img src>)."""
    if not url:
        return None
    u = str(url).strip()[:500]
    if not u.lower().startswith("https://"):
        raise HTTPException(status_code=422, detail="La foto debe ser una URL https://")
    return u
