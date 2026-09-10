"""Seed idempotente de usuarios demo (admin + arrendador).

Uso:
  python -m backend.scripts.seed_db        # desde la raíz del repo
  python backend/scripts/seed_db.py        # directo
  DATABASE_URL=postgresql+asyncpg://... python -m backend.scripts.seed_db  # Supabase

Lee DATABASE_URL del entorno o de backend/.env. Con Supabase (host
supabase.co) activa SSL automáticamente. Genera los hashes con la MISMA
librería del backend (passlib CryptContext bcrypt, ver app/core/security.py),
nunca hashes copiados a mano. UPSERT por email (ON CONFLICT DO UPDATE):
idempotente, seguro de re-ejecutar. Imprime `[OK] Usuarios demo listos e
integrados en BD` al final. No toca publicaciones ni reportes.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
except ImportError:  # pragma: no cover - python-dotenv es dependencia, fallback a env
    pass

from passlib.context import CryptContext

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Demo único: misma clave para los 2 roles (documentado en Perfil/Publicar).
DEMOS = [
    {
        "nombre": "Arrendador Demo",
        "email": "arrendador@alojau.com",
        "password": "AlojaU123",
        "telefono": "573001234567",
        "rol": "ARRENDADOR",
        "verificado": True,
    },
    {
        "nombre": "Admin AlojaU",
        "email": "admin@alojau.com",
        "password": "AlojaU123",
        "telefono": "573009999999",
        "rol": "ADMIN",
        "verificado": True,
    },
]

UPSERT = """
INSERT INTO usuarios (nombre_completo, email, password_hash, telefono_whatsapp, rol, telefono_verificado)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  nombre_completo = EXCLUDED.nombre_completo,
  telefono_whatsapp = EXCLUDED.telefono_whatsapp,
  rol = EXCLUDED.rol,
  telefono_verificado = EXCLUDED.telefono_verificado
"""


def _dsn() -> str:
    raw = os.getenv(
        "DATABASE_URL", "postgresql://alojau:alojau123@localhost:5432/alojau"
    )
    dsn = raw.replace("postgresql+asyncpg://", "postgresql://")
    return dsn


async def main() -> None:
    import asyncpg

    dsn = _dsn()
    masked = dsn.split("@")[-1] if "@" in dsn else "localhost"
    print(f"[seed] conectando a {masked} ...")
    # Supabase exige SSL; local no.
    ssl = "supabase.co" in dsn and "ssl=" not in dsn
    conn = await asyncpg.connect(dsn, ssl=ssl if ssl else None)
    try:
        for demo in DEMOS:
            # Misma librería que app/core/security.hash_password (passlib bcrypt).
            digest = pwd_ctx.hash(demo["password"])
            await conn.execute(
                UPSERT,
                demo["nombre"],
                demo["email"],
                digest,
                demo["telefono"],
                demo["rol"],
                demo["verificado"],
            )
            print(f"[seed] upsert {demo['email']} ({demo['rol']})")
        total = await conn.fetchval("SELECT count(*) FROM usuarios")
        print(f"[seed] usuarios en BD: {total}")
    finally:
        await conn.close()
    print("[OK] Usuarios demo listos e integrados en BD")


if __name__ == "__main__":
    asyncio.run(main())
