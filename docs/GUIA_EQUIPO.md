# Guía Equipo AlojaU — Cómo empezar en 10 min

## 1. Clonar (cada compañero)
```bash
git clone https://github.com/Temaru31/AlojaU.git
cd AlojaU
git checkout develop
git pull
```

## 2. Elegir tu HU (Sprint 1 = 20SP/37h)
| HU | SP | Rama | Responsable | Qué entrega |
|---|---|---|---|---|
| HU-001 Buscar campus | 5/8h | feature/HU-001-buscar-campus | Yeixon | GET /api/publicaciones?campus_id + Card + Haversine |
| HU-002 Filtros | 3/7h | feature/HU-002-filtros | Yeixon | precio/tipo/servicios combinados |
| HU-003 Detalle | 3/7h | feature/HU-003-detalle | Adrian | Ficha + distancia + fecha |
| HU-005 Publicar | 5/8h | feature/HU-005-publicar | Adrian | POST → PENDIENTE, ≥3 fotos |
| HU-007 Índice | 2/4h | feature/HU-007-indice-confianza | Angel | 40+20+15+15+10 + desglose |
| HU-008 WhatsApp | 2/3h | feature/HU-008-whatsapp | Yeixon | wa.me con ID |

```bash
git checkout feature/HU-001-buscar-campus
```

## 3. Correr local (3 terminales)
```bash
# T1 BD (opcional Sprint1, mock funciona sin BD)
docker-compose up -d
docker exec -i alojau_db psql -U alojau -d alojau < backend/db/schema.sql
docker exec -i alojau_db psql -U alojau -d alojau < backend/db/seed.sql

# T2 Backend
cd backend && python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000  # http://localhost:8000/docs

# T3 Frontend
cd frontend && npm install && cp .env.example .env && npm run dev  # http://localhost:5173
```

## 4. Trabajar con IA sin perderse
- Usa IA para esqueletos, Gherkin, explicar errores, NO para inventar refs o decidir pesos índice
- Bitácora en `docs/IA_BITACORA.md` + 4 controles en PR
- Todo endpoint `/api/publicaciones` (no listings), fotos 3, distancia Haversine

## 5. PR (cuando termines HU)
1. `git commit -m "feat(HU-001): ..."`
2. `git push -u origin feature/HU-001-buscar-campus`
3. GitHub → Pull Request → base: develop → 2 capturas (desktop+mobile) → DoD 6 puntos
4. Pide review a quien NO codeó la HU (revisión cruzada)

Ver: `docs/SPRINT1_SCOPE.md`, `docs/SCRUM_Y_QA.md`, `docs/ARQUITECTURA.md`, `CONTRIBUTING.md`
