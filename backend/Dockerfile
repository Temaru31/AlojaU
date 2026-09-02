# AlojaU Backend — Dockerfile para Render Free ($0)
# Usa Python 3.11 slim, instala deps, expone $PORT de Render
FROM python:3.11-slim

WORKDIR /app

# Evita bytecode + buffer para logs en Render
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# Dependencias sistema para asyncpg
RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render inyecta $PORT (ej. 10000). Fallback 8000 para local
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
