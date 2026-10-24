#!/usr/bin/env bash
# verify_ci.sh — réplica local EXACTA del job `backend` de GitHub Actions.
#
# Regla del repo: nadie hace push sin correr este script. Lo que aquí pasa,
# pasa en CI; lo que aquí falla, fallará en CI.
#
# Lo que hace (idempotente, seguro):
#   1. Crea desde cero la BD scratch `alojau_ci` (NUNCA toca tu BD dev `alojau`).
#   2. Aplica `backend/db/schema.sql` + `backend/db/migrations/*.sql` en orden
#      (igual que el paso "Init DB schema" del workflow).
#   3. Corre la suite con el MISMO gate de CI:
#        pytest tests/ -q --cov=app --cov-report=term-missing --cov-fail-under=70
#   4. Limpia la BD scratch al salir (éxito o fallo).
#
# Uso:
#   ./scripts/verify_ci.sh            # desde la RAÍZ del repo
#
# Requiere: PostgreSQL local con rol alojau/alojau123 (igual que CI),
# python3 con requirements.txt + requirements-dev.txt instalados.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO/backend"

export ENV=test
export DATABASE_URL="postgresql+asyncpg://alojau:alojau123@localhost:5432/alojau_ci"
export SECRET_KEY="ci_dummy_secret_key_para_tests_32_chars_min"
export USE_MOCK_FALLBACK="True"
export CORS_ORIGINS="http://localhost:5173,http://localhost:3000"

# Defensa: jamás contra prod (misma regla que tests/conftest.py).
case "$DATABASE_URL" in
  *supabase.co*) echo "ABORTO: DATABASE_URL apunta a producción." >&2; exit 2;;
esac
if [ "${ENV}" = "prod" ]; then echo "ABORTO: ENV=prod." >&2; exit 2; fi

echo "== [1/4] BD scratch alojau_ci (recreada) =="
python3 - <<'EOF'
import asyncio
import asyncpg

ADMIN_DSN = "postgresql://alojau:alojau123@localhost:5432/postgres"

async def main():
    conn = await asyncpg.connect(ADMIN_DSN)
    try:
        await conn.execute("DROP DATABASE IF EXISTS alojau_ci WITH (FORCE)")
        await conn.execute("CREATE DATABASE alojau_ci")
    finally:
        await conn.close()

asyncio.run(main())
EOF

limpiar() {
  python3 - <<'EOF' 2>/dev/null || true
import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect(
        "postgresql://alojau:alojau123@localhost:5432/postgres")
    try:
        await conn.execute("DROP DATABASE IF EXISTS alojau_ci WITH (FORCE)")
    finally:
        await conn.close()

asyncio.run(main())
EOF
}
trap limpiar EXIT

echo "== [2/4] schema.sql + db/migrations/*.sql =="
python3 - <<'EOF'
import asyncio
import glob
import asyncpg

async def main():
    conn = await asyncpg.connect(
        "postgresql://alojau:alojau123@localhost:5432/alojau_ci")
    try:
        with open("db/schema.sql", encoding="utf-8") as f:
            await conn.execute(f.read())
        for mig in sorted(glob.glob("db/migrations/*.sql")):
            with open(mig, encoding="utf-8") as f:
                await conn.execute(f.read())
            print(f"  aplicada: {mig}")
    finally:
        await conn.close()

asyncio.run(main())
EOF

echo "== [3/4] pytest (gate coverage 70, igual que CI) =="
python3 -m pytest tests/ -q --cov=app --cov-report=term-missing --cov-fail-under=70

echo "== [4/4] limpieza =="
# (la hace el trap EXIT; este eco confirma el paso)
echo "OK: réplica CI verde. Puedes pushear."
