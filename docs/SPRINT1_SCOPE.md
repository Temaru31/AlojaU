# Sprint 1 — Alcance PO | AlojaU

> **Objetivo Sprint 1 (p35 PDF):** Entregar incremento demostrable **Buscar → Filtrar → Entender → Confiar → Contactar** + publicar `PENDIENTE`.

## 1. Gap Esqueleto vs Documento

| HU | Pide PDF (20SP/37h) | Ya hay en esqueleto | Falta para valor demoable |
|---|---|---|---|
| HU-001 5/8h Buscar campus | GET /api/publicaciones?campus_id + Haversine orden | Mock 2 pubs, no ordena por distancia real | JOIN publicacion_campus + cálculo Haversine + índice |
| HU-002 3/7h Filtros | precio/tipo/servicios combinables | Solo precio en mock | Filtros tipo y servicios AND |
| HU-003 3/7h Detalle | Ficha completa + distancia + fecha | Mock sin servicios/fotos reales | JOIN servicios, imágenes, zona |
| HU-005 5/8h Publicar | POST → PENDIENTE, ≥3 fotos, AUTH | Form dummy sin POST | POST + JWT ARRENDADOR + audit |
| HU-007 2/4h Índice | 40+20+15+15+10 reproducible | Función existe pero no cableada | Cablear TrustScoreEngine |
| HU-008 2/3h WhatsApp | wa.me con referencia | OK en Detalle.jsx | Nada, ya OK |

**Esqueleto = 40%** (UI navegable). **Con 2 días enfocados → 90% demoable.**

## 2. MVP Demoable 2 días (SÍ / NO)

**SÍ (4 endpoints + 3 páginas):**
- `GET /health`, `GET /api/campus` (4 campus reales), `GET /api/publicaciones?campus_id`, `GET /api/publicaciones/{id}`, `POST /api/publicaciones` (PENDIENTE), `POST /api/auth/*`
- Páginas `/` (Buscar con campus dinámico), `/publicacion/:id` (índice + wa.me), `/publicar` (form mínimo)

**NO (fuera Sprint1, Tabla23:34):**
- HU-004 Comparar, HU-006 Renovar, HU-009 Favoritos, HU-010 Moderación, Pagos, Chat, IA

## 3. Orden técnico (dependencias)
`HU-001` → `HU-003` → `HU-002` → `HU-007` → `HU-005` → `HU-008`

## 4. Criterios Gherkin (resumen para devs)
- **HU-001 C1:** campus_id=1 → solo ACTIVO, orden Haversine
- **HU-001 C2:** 0 resultados → mensaje vacío, sin inactivos
- **HU-002 C1:** min>max → 422
- **HU-003 C3:** PENDIENTE no contactable
- **HU-005 C2:** <3 fotos → 422
- **HU-007:** desglose 40+20+15+15+10 + disclaimer
- **HU-008:** wa.me con ID si teléfono verificado

## 5. 5 Decisiones PO no negociables
1. **NO pagos/contratos/chat** — solo wa.me
2. **Distancia = Haversine geodésica**, no tiempo a pie
3. **≥3 fotos** y validación Pydantic estricta
4. **POST siempre PENDIENTE** + audit
5. **Índice informativo** 80/50/0 verde/amarillo/naranja + `PENDIENTE+CONFIRMADO` (no ACTIVO)

*Próximo: BD seed → cablear Haversine/Trust → Auth → POST PENDIENTE*
