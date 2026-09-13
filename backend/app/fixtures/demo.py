"""Fixtures demo canónicos (única fuente MOCK_CAMPUS).
Uso: routers/campus.py (lista) y routers/publicaciones.py (dict). Ej: MOCK_CAMPUS[1]["lng"] -> -76.606."""

_CAMPUS = [
    {
        "id": 1, "ciudad_id": 1, "institucion": "Universidad del Cauca",
        "nombre_sede": "Campus Tulcán", "direccion": "Calle 5 # 4-70",
        "lat": 2.443, "lng": -76.606, "latitud": 2.443, "longitud": -76.606,
        "categoria": "UNIVERSIDAD", "activo": True,
    },
    {
        "id": 2, "ciudad_id": 1, "institucion": "Unicomfacauca",
        "nombre_sede": "Claustro Centro", "direccion": "Calle 4 # 8-30",
        "lat": 2.441, "lng": -76.606, "latitud": 2.441, "longitud": -76.606,
        "categoria": "UNIVERSIDAD", "activo": True,
    },
    # 004 POIs (mismas coords aproximadas que seed.sql; el contrato ?campus_id= no cambia).
    {
        "id": 3, "ciudad_id": 1, "institucion": "Centro Comercial Campanario",
        "nombre_sede": "Sede Única", "direccion": "Carrera 9 # 24N-43",
        "lat": 2.4467, "lng": -76.6014, "latitud": 2.4467, "longitud": -76.6014,
        "categoria": "CENTRO_COMERCIAL", "activo": True,
    },
    {
        "id": 4, "ciudad_id": 1, "institucion": "Hospital Universitario San José",
        "nombre_sede": "Sede Principal", "direccion": "Carrera 6 # 10N-142",
        "lat": 2.451, "lng": -76.599, "latitud": 2.451, "longitud": -76.599,
        "categoria": "SALUD", "activo": True,
    },
    {
        "id": 5, "ciudad_id": 1, "institucion": "Terminal de Transportes",
        "nombre_sede": "Sede Única", "direccion": "Transversal 9 # 4N-125",
        "lat": 2.4505, "lng": -76.613, "latitud": 2.4505, "longitud": -76.613,
        "categoria": "TRANSPORTE", "activo": True,
    },
    {
        "id": 6, "ciudad_id": 1, "institucion": "Parque Caldas",
        "nombre_sede": "Centro Histórico", "direccion": "Parque Caldas Centro",
        "lat": 2.4418, "lng": -76.6064, "latitud": 2.4418, "longitud": -76.6064,
        "categoria": "OTRO", "activo": True,
    },
]

MOCK_CAMPUS_LIST = [dict(c) for c in _CAMPUS]
MOCK_CAMPUS = {c["id"]: dict(c) for c in _CAMPUS}
