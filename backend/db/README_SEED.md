# BD - Cómo cargar schema y seed

## Automático (recomendado, v7)
```bash
python3 backend/scripts/seed_all.py
# aplica seed.sql (16 pubs: 13 ACTIVO + 3 PAUSADO_POR_REPORTE, 7 lugares,
# 6 zonas, 3 usuarios), garantiza system_settings e imprime el resumen.
# debe dar 16 pubs (13 ACTIVO + 3 PAUSADO_POR_REPORTE), 112 dist, 45 fotos
```
Supabase: `ALOJAU_SEED_CONFIRM=yes DATABASE_URL=... python3 backend/scripts/seed_all.py`

## Docker
```bash
docker-compose up -d
# espera 5s
docker exec -i alojau_db psql -U alojau -d alojau < backend/db/schema.sql
docker exec -i alojau_db psql -U alojau -d alojau < backend/db/seed.sql
# verifica
docker exec -i alojau_db psql -U alojau -d alojau -c "SELECT 'pubs',COUNT(*) FROM publicaciones UNION ALL SELECT 'dist',COUNT(*) FROM publicacion_campus;"
# debe dar 16 pubs, 112 dist, 45 fotos
```

## Sin Docker (Supabase)
1. Supabase → SQL Editor → pega `schema.sql` → Run
2. Pega `seed.sql` → Run
3. Copia `DATABASE_URL` de Supabase (Session Pooler) a `backend/.env`

## Sin psql local
```bash
docker-compose up -d
psql "postgresql://alojau:alojau123@localhost:5432/alojau" -f backend/db/schema.sql
psql "postgresql://alojau:alojau123@localhost:5432/alojau" -f backend/db/seed.sql
```

## Recalcular Haversine
```bash
python backend/scripts/recalc_haversine.py --dry-run
python backend/scripts/recalc_haversine.py
```
