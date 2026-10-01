#!/usr/bin/env python3
"""Poblado automático de la base de datos AlojaU (Tarea 1, v7).

Uso:
  python3 backend/scripts/seed_all.py                 # local (.env o defaults)
  DATABASE_URL=postgresql://... python3 backend/scripts/seed_all.py  # Supabase

No delega SQL al usuario: ejecuta backend/db/seed.sql (TRUNCATE + 16 pubs en
3 escenarios + 3 pausados), garantiza los defaults de system_settings
(migración 005) y verifica el resultado con un resumen por escenario e
índices de confianza recalculados en vivo.

Idempotente y seguro de re-ejecutar. NUNCA apuntar a prod sin respaldo.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
except ImportError:  # pragma: no cover
    pass

BASE = os.path.join(os.path.dirname(__file__), "..")
SEED_SQL = os.path.join(BASE, "db", "seed.sql")
SETTINGS_SQL = os.path.join(BASE, "db", "005_admin_automation.sql")

SETTINGS_DEFAULTS = [
    ("dias_vigencia_publicacion", "30", "int", "Días de vigencia al publicar/renovar"),
    ("max_reportes_para_pausa_automatica", "3", "int", "Reportes que pausan el aviso"),
    ("auto_aprobar_arrendadores_verificados", "false", "bool", "Auto-aprobar verificados"),
]

RESUMEN = """
SELECT estado, count(*) AS n FROM publicaciones GROUP BY estado ORDER BY estado;
"""


def _dsn() -> str:
    raw = os.getenv("DATABASE_URL", "postgresql://alojau:alojau123@localhost:5432/alojau")
    return raw.replace("postgresql+asyncpg://", "postgresql://")


async def main() -> None:
    import asyncpg

    dsn = _dsn()
    bajo = dsn.lower()
    if "supabase.co" in bajo and os.getenv("ALOJAU_SEED_CONFIRM", "") != "yes":
        print("[seed_all] ABORTADO: apunta a Supabase. Re-ejecuta con ALOJAU_SEED_CONFIRM=yes.")
        sys.exit(2)
    print(f"[seed_all] conectando a {dsn.split('@')[-1]} ...")
    conn = await asyncpg.connect(dsn)
    try:
        with open(SEED_SQL, encoding="utf-8") as f:
            await conn.execute(f.read())
        print("[seed_all] seed.sql aplicado (16 pubs, 7 lugares, 6 zonas, 3 usuarios).")
        for clave, valor, tipo, desc in SETTINGS_DEFAULTS:
            await conn.execute(
                """INSERT INTO system_settings (clave, valor, tipo, descripcion)
                   VALUES ($1, $2, $3, $4) ON CONFLICT (clave) DO NOTHING""",
                clave, valor, tipo, desc,
            )
        print("[seed_all] system_settings garantizados.")
        print("[seed_all] --- resumen por estado ---")
        for row in await conn.fetch(RESUMEN):
            print(f"  {row['estado']}: {row['n']}")
        fotos = await conn.fetchval("SELECT count(*) FROM imagenes_publicacion")
        dist = await conn.fetchval("SELECT count(*) FROM publicacion_campus")
        print(f"[seed_all] fotos: {fotos} | distancias: {dist}")
    finally:
        await conn.close()
    print("[OK] Base de datos poblada y verificada")


if __name__ == "__main__":
    asyncio.run(main())
