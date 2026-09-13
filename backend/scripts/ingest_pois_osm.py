#!/usr/bin/env python3
"""Ingesta de POIs desde OpenStreetMap (Overpass API) — costo cero.

Consulta universidades, centros comerciales, hospitales y terminales dentro
del bounding box de Popayán y genera un .sql idempotente (ON CONFLICT DO
NOTHING) listo para Supabase SQL Editor o psql. Solo stdlib (sin deps nuevas).

Uso:
    python3 ingest_pois_osm.py --bbox 2.38,-76.65,2.50,-76.55 --out pois_popayan.sql
    python3 ingest_pois_osm.py --dry-run   # muestra la query sin llamar a la API

Categorías AlojaU: UNIVERSIDAD | CENTRO_COMERCIAL | SALUD | TRANSPORTE | OTRO.
Regla anti-duplicados: UNIQUE(institucion, nombre_sede) + ON CONFLICT DO NOTHING.
Tras importar, las distancias se calculan con backend/db/004 (trigger) o con
el backfill SELECT de seed.sql. Cortesía Overpass: 1 req, sin paralelismo.
"""
import argparse
import json
import urllib.parse
import urllib.request

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# (clave overpass, categoria AlojaU, etiqueta)
REGLAS = [
    ("amenity=university", "UNIVERSIDAD", "Universidad"),
    ("amenity=hospital", "SALUD", "Hospital"),
    ("shop=mall", "CENTRO_COMERCIAL", "Centro Comercial"),
    ("amenity=bus_station", "TRANSPORTE", "Terminal/Estación"),
]


def build_query(bbox: str) -> str:
    sur, oeste, norte, este = bbox
    partes = []
    for filtro, _, _ in REGLAS:
        k, v = filtro.split("=")
        partes.append(f'node["{k}"="{v}"]({sur},{oeste},{norte},{este});')
        partes.append(f'way["{k}"="{v}"]({sur},{oeste},{norte},{este});')
    return "[out:json][timeout:60];(" + "".join(partes) + ");out center tags;"


def fetch(query: str) -> dict:
    data = urllib.parse.urlencode({"data": query}).encode()
    req = urllib.request.Request(OVERPASS_URL, data=data, method="POST",
                                 headers={"User-Agent": "AlojaU-POI-Ingest/1.0"})
    with urllib.request.urlopen(req, timeout=90) as res:
        return json.loads(res.read().decode("utf-8"))


def sql_escape(s: str) -> str:
    return (s or "").replace("'", "''")[:150]


def to_sql(payload: dict, ciudad_id: int = 1) -> str:
    lineas = [
        "-- POIs importados de OpenStreetMap (Overpass). Revisar nombres antes de prod.",
        "-- Recalcula distancias con: SELECT ... (ver seed.sql backfill 004) o el trigger.",
    ]
    vistos = set()
    for el in payload.get("elements", []):
        tags = el.get("tags", {})
        nombre = tags.get("name")
        if not nombre:
            continue
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lon = el.get("lon") or (el.get("center") or {}).get("lon")
        if lat is None or lon is None:
            continue
        for filtro, categoria, _ in REGLAS:
            k, v = filtro.split("=")
            if tags.get(k) == v:
                break
        else:
            categoria = "OTRO"
        clave = (nombre.strip().lower(), categoria)
        if clave in vistos:
            continue
        vistos.add(clave)
        base_dir = f"{tags.get('addr:street', '')} {tags.get('addr:housenumber', '')}".strip() or "Popayán"
        direccion = sql_escape(base_dir)
        lineas.append(
            "INSERT INTO campus_universitarios "
            "(ciudad_id, institucion, nombre_sede, direccion, latitud, longitud, categoria) VALUES "
            f"({ciudad_id}, '{sql_escape(nombre)}', 'Sede Única', '{direccion}', "
            f"{float(lat):.7f}, {float(lon):.7f}, '{categoria}') "
            "ON CONFLICT DO NOTHING;"
        )
    return "\n".join(lineas) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingesta de POIs OSM -> SQL idempotente.")
    ap.add_argument("--bbox", default="2.38,-76.65,2.50,-76.55",
                    help="sur,oeste,norte,este (default: Popayán)")
    ap.add_argument("--out", default="pois_popayan.sql")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--ciudad-id", type=int, default=1)
    args = ap.parse_args()

    bbox = args.bbox.split(",")
    if len(bbox) != 4:
        raise SystemExit("--bbox debe ser sur,oeste,norte,este")
    query = build_query(bbox)
    if args.dry_run:
        print(query)
        return
    print("Consultando Overpass API (Popayán)...")
    payload = fetch(query)
    print(f"Elementos: {len(payload.get('elements', []))}")
    sql = to_sql(payload, args.ciudad_id)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(sql)
    n = sql.count("INSERT INTO")
    print(f"SQL idempotente: {args.out} ({n} POIs). Revísalo y aplícalo en Supabase/psql.")


if __name__ == "__main__":
    main()
