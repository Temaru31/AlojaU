"""004 POIs: categoria + campus_ref + trigger + caché (puro + API mock).

Sin PG corren en modo mock (igual que test_api.py). Con PG, el reseed de
conftest aplica seed.sql (con POIs 3-6) y los mismos asserts valen.
"""
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.services.haversine import tiempo_pie_min
from app.services import publicacion_view as view

client = TestClient(app)


def _items(data):
    return data["items"] if isinstance(data, dict) and "items" in data else data


# --- Puro -----------------------------------------------------------------
def test_tiempo_pie_min_factor_ruta():
    # 320 m línea recta -> ~5 min a pie (x1.3 / 80, mínimo 1).
    assert tiempo_pie_min(320) == 5
    assert tiempo_pie_min(111) == 2
    assert tiempo_pie_min(0) == 1
    assert tiempo_pie_min(None) is None


def test_build_detail_incluye_campus_ref():
    class Img:
        url = "https://a.com/1.jpg"

    class Svc:
        id = 1
        nombre = "WiFi Fibra"

    class Pub:
        id = 1
        titulo = "Habitación cerca Tulcán - 320m"
        descripcion = "Amoblada con baño privado y cocina compartida amplia"
        tipo_inmueble = "HABITACION_INDEPENDIENTE"
        canon_mensual = 480000
        deposito_requerido = 200000
        zona_barrio_id = 3
        direccion_referencial = "Calle 5 # 2-10 Tulcán"
        reglas_convivencia = "No mascotas, visitas hasta 9pm"
        estado = "ACTIVO"
        latitud = 2.444
        longitud = -76.606
        servicios = [Svc()]
        imagenes = [Img(), Img(), Img()]

        from datetime import datetime, timezone
        fecha_renovacion = datetime.now(timezone.utc)
        fecha_expiracion = datetime.now(timezone.utc)

    class User:
        telefono_verificado = True
        telefono_whatsapp = "573001234567"

    ref = {"campus_id": 3, "institucion": "Centro Comercial Campanario",
           "nombre_sede": "Sede Única", "latitud": 2.4467, "longitud": -76.6014,
           "dist_m": 900, "tiempo_pie_min": 15}
    out = view.build_detail(Pub(), 0, User(), 900, ref)
    assert out["campus_ref"] == ref
    assert out["latitud"] == 2.444
    # Sin ref: clave presente en None (contrato estable para el frontend).
    out2 = view.build_detail(Pub(), 0, User(), 111)
    assert out2["campus_ref"] is None


def test_ingest_osm_genera_sql_idempotente():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "ingest", Path(__file__).parent.parent / "scripts" / "ingest_pois_osm.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    payload = {"elements": [
        {"lat": 2.45, "lon": -76.6, "tags": {"name": "Hospital X", "amenity": "hospital"}},
        {"lat": 2.45, "lon": -76.6, "tags": {"name": "Hospital X", "amenity": "hospital"}},  # dup
        {"lat": 2.44, "lon": -76.6, "tags": {}},  # sin nombre: se omite
        {"center": {"lat": 2.44, "lon": -76.6}, "tags": {"name": "Mall Y", "shop": "mall"}},
    ]}
    sql = mod.to_sql(payload)
    assert sql.count("INSERT INTO") == 2  # dedup + omisión verificados
    assert "ON CONFLICT DO NOTHING" in sql
    assert "'SALUD'" in sql and "'CENTRO_COMERCIAL'" in sql


def test_004_sql_canonico_idempotente():
    sql = (Path(__file__).parent.parent / "db" / "004_pois_categoria.sql").read_text(encoding="utf-8")
    for marca in ["IF NOT EXISTS", "OR REPLACE", "trg_publicacion_recalcular_distancias",
                  "idx_campus_ciudad_categoria", "chk_campus_categoria",
                  "ON CONFLICT (publicacion_id, campus_id)",
                  "UPDATE OF latitud, longitud"]:
        assert marca in sql, f"falta marca idempotente: {marca}"


# --- API (mock sin PG) ------------------------------------------------------
def test_campus_trae_categoria_y_cache():
    from app.routers.campus import clear_campus_cache
    clear_campus_cache()
    r = client.get("/api/campus")
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 2
    assert all("categoria" in c for c in items)
    assert r.headers.get("Cache-Control") == "public, max-age=3600"
    r2 = client.get("/api/campus")
    assert r2.headers.get("X-Cache") == "HIT"
    assert r2.json() == items


def test_listado_campus_id_ordena_por_distancia():
    r = client.get("/api/publicaciones", params={"campus_id": 1})
    assert r.status_code == 200
    pubs = _items(r.json())
    dists = [p["distancia_geodesica_m"] for p in pubs]
    assert dists == sorted(d for d in dists if d is not None) or not dists
    assert all(p["estado"] == "ACTIVO" for p in pubs)


def test_detalle_con_campus_id_resuelve_ref():
    r = client.get("/api/publicaciones/1", params={"campus_id": 3})
    assert r.status_code == 200
    body = r.json()
    ref = body["campus_ref"]
    assert ref["campus_id"] == 3
    assert ref["institucion"] == "Centro Comercial Campanario"
    assert ref["dist_m"] == body["distancia_geodesica_m"]
    assert ref["tiempo_pie_min"] == tiempo_pie_min(ref["dist_m"])


def test_detalle_sin_campus_id_sin_ref():
    r = client.get("/api/publicaciones/1")
    assert r.status_code == 200
    assert r.json()["campus_ref"] is None


def test_detalle_campus_inexistente_404():
    r = client.get("/api/publicaciones/1", params={"campus_id": 999})
    assert r.status_code == 404


def test_mock_poi_nuevo_no_vacia_listado():
    # Paridad trigger: un POI sin membresía explícita ordena por distancia, no filtra todo.
    r = client.get("/api/publicaciones", params={"campus_id": 3})
    assert r.status_code == 200
    pubs = _items(r.json())
    assert len(pubs) >= 1
    dists = [p["distancia_geodesica_m"] for p in pubs]
    assert dists == sorted(d for d in dists if d is not None) or not dists
