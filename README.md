# AlojaU — Vivienda universitaria Popayán

Monorepo Proyecto II - Grupo 5 Roomate

## Stack oficial (p22 PDF)
Frontend: React 18 + Vite + Tailwind 3 + React Router + Leaflet + Axios
Backend: Python 3.11/3.12 + FastAPI + Uvicorn + Pydantic v2 + OpenAPI
BD: PostgreSQL 16 + SQLAlchemy 2.0 async + asyncpg

## Cómo correr local (3 terminales)

### Terminal 1 - BD (requiere Docker)
```bash
docker-compose up -d
# si usas docker compose v2: docker compose up -d
# pgAdmin: http://localhost:5050 (admin@alojau.com / admin123)
# alternativa sin Docker: crea proyecto en supabase.com y usa su DATABASE_URL
```

### Terminal 2 - Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env  # edita si usas Supabase
uvicorn app.main:app --reload --port 8000
# Docs: http://localhost:8000/docs
# Health: http://localhost:8000/health
```

### Terminal 3 - Frontend
```bash
cd frontend
npm install
cp .env.example .env  # VITE_API_URL=http://localhost:8000
npm run dev
# http://localhost:5173
```

## Ramas (HU)
- main (protegida)
- develop
- feature/HU-001-buscar-campus (Yeixon)
- feature/HU-002-filtros (Yeixon)
- feature/HU-003-detalle (Adrian)
- feature/HU-005-publicar (Adrian)
- feature/HU-007-indice-confianza (Angel)
- feature/HU-008-whatsapp (Yeixon)

Cada PR requiere revisión cruzada (quien codea no aprueba solo).

## Despliegue gratis
Frontend -> Vercel (root: frontend)
Backend -> Render / Railway (root: backend, start: uvicorn app.main:app --host 0.0.0.0 --port $PORT)
BD -> Supabase / Neon
Storage -> Cloudinary / Supabase Storage

## Fixes críticos ya aplicados (ver informe p25-31)
- Índice confianza: PENDIENTE+CONFIRMADO (no ACTIVO)
- Endpoints: /api/publicaciones y /api/campus
- Fotos mínimo 3
