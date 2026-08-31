## HU

Closes: HU-00X <!-- ej: HU-001 -->

## Qué hace
- 

## Cómo probar (copy-paste)
```bash
curl -s http://localhost:8000/api/publicaciones?campus_id=1 | jq
curl -s http://localhost:8000/api/publicaciones/1 | jq
```

## DoD 6 puntos (marca con [x] y evidencia)
- [ ] DoD-1 Código trazable: rama feature/HU-00X → PR a develop, commits feat(HU-00X): ...
- [ ] DoD-2 Gherkin: criterios HU verificados (ver docs/SCRUM_Y_QA.md §4)
- [ ] DoD-3 Capturas: Desktop 1280 + Mobile 375 adjuntas
- [ ] DoD-4 Test manual: curl / pasos UI pegados, sin regresión HU-001/002/003
- [ ] DoD-5 Seguridad: 401/403, Pydantic, SQL parametrizada, wa.me encodeURIComponent
- [ ] DoD-6 Trello: tarjeta en En revisión/QA con checklist, link a este PR, reviewer distinto

## IA responsable (si usaste)
- [ ] C1 Fuente oficial verificada
- [ ] C2 Ejecución local OK
- [ ] C3 Lectura línea por línea
- [ ] C4 Decisión humana (pesos índice, estados, /api/publicaciones)
- Prompt/bitácora: 

## Reviewer checklist
- [ ] No secretos (.env), `npm run build` OK, índice no es garantía, distancia Haversine
