"""Fixtures demo canónicos (única fuente MOCK_CAMPUS).
Uso: routers/campus.py (lista) y routers/publicaciones.py (dict). Ej: MOCK_CAMPUS[1]["lng"] -> -76.606."""

_CAMPUS = [
    {
        "id": 1, "ciudad_id": 1, "institucion": "Universidad del Cauca",
        "nombre_sede": "Campus Tulcán", "direccion": "Calle 5 # 4-70",
        "lat": 2.443, "lng": -76.606, "latitud": 2.443, "longitud": -76.606,
        "activo": True,
    },
    {
        "id": 2, "ciudad_id": 1, "institucion": "Unicomfacauca",
        "nombre_sede": "Claustro Centro", "direccion": "Calle 4 # 8-30",
        "lat": 2.441, "lng": -76.606, "latitud": 2.441, "longitud": -76.606,
        "activo": True,
    },
]

MOCK_CAMPUS_LIST = [dict(c) for c in _CAMPUS]
MOCK_CAMPUS = {c["id"]: dict(c) for c in _CAMPUS}
