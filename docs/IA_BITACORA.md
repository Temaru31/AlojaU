# Bitácora IA - AlojaU

| Fecha | Prompt | Herramienta | Validación |
|---|---|---|---|
| 2026-08-28 | Consolidar 10 HU LaTeX | Codex | Revisado vs original, SERIAL→IDENTITY |
| 2026-08-30 | Esqueleto monorepo + routers + seed | Muse Spark | npm run build OK, backend mock OK |
| Ago 2026 heredado — validado 2026-08-28 | docker-compose, haversine | Codex | docker compose config + haversine demo |

4 controles p40: C1 fuente oficial, C2 ejecución local, C3 lectura línea, C4 decisión humana
| 2026-09-09 | P1 T1 API reportes (POST anon 201 + 429 + GET/PATCH admin) + seed bcrypt fix | Muse Spark | pytest 85 passed (11 T1), vitest 55 |
| 2026-09-09 | P1 T1 Fase1 frontend (ReportarModal + botón Detalle + AdminReportes + ruta) | Muse Spark | vitest 60, build OK, sin regresiones |
| 2026-09-09 | P1 T1 F3 Cloudinary (storage Strategy Local/Cloudinary + fix leaks UploadFotos + tests) | Muse Spark | pytest 92 passed (7 F3), vitest 66 passed (6 F3), build OK |
| 2026-09-09 | Merge T1-reportes → develop (ff, 0 conflictos) + push develop OK + revisión pre-main sin bugs bloqueantes | Muse Spark | develop: pytest 92, vitest 66, build OK; main queda para PR con review |
| 2026-09-09 | UX integral (scroll Detalle, reportar x2, colores confianza, /mias + AuthContext + navbar avatar, limpieza textos) rama feature/UX-mejoras | Muse Spark | pytest 96 passed (4 mias), vitest 76 passed (10 UX), build OK |
| 2026-09-09 | Fix 5 errores + auditoría UX subagente (sin screenshots, código+curl) + merge UX a main + check Vercel | Muse Spark | pytest 96, vitest 79, build OK, prod verificada |
| 2026-09-09 | Dueño+Perfil (/mias paginado, PATCH editar, MisPubs modal, Perfil datos, ScrollToTop) rama feature/DUENO-perfil | Muse Spark | pytest 102, vitest 83, build OK, live OK |
| 2026-09-10 | RBAC admin (seed_db.py, /api/admin, dashboard, guard, perfil por rol) rama feature/RBAC-admin | Muse Spark | pytest 107 (5 RBAC), vitest 90 (7 RBAC), build OK, live OK |
| 2026-09-10 | Seed Supabase [OK] + T5 conftest reseed hermético + guard anti-prod, rama feature/T5-aislamiento | Muse Spark | pytest 107, counts 6/1/2 intactos, vitest 90, build OK |
