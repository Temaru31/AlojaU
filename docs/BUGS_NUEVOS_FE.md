# BUGS NUEVOS FE (detectados en rama `feature/FE-bugs-responsive`, 2026-09-09)

> Regla: fix ≤ 3 líneas → arreglado + commit. Mayor → se documenta aquí.

## Arreglados (≤ 3 líneas)

| # | Archivo:línea | Descripción | Commit |
|---|---------------|-------------|--------|
| N-01 | `frontend/src/components/Card.jsx:9,64` | `indice_confianza` null mostraba badge vacío ("— Básico"). `?? 0`. | `9b491d2` |
| N-02 | `frontend/src/pages/Detalle.jsx:119` | Canon null mostraba `$0` (engañoso). Ahora "No informado". | `9b491d2` |
| N-03 | `frontend/src/pages/Comparar.jsx:110` | Encabezado de columna con `p.titulo` vacío si falla el fetch. Fallback "No informado". | `9b491d2` |
| N-04 | `frontend/src/pages/Buscar.jsx:114` | Buscador sticky `z-40` competía con el backdrop del menú móvil (`z-40`, posterior en DOM). Bajado a `z-30` (nav `z-50` intacto). | `9b491d2` |

## Pendientes (mayores, > 3 líneas)

### FE-NEW-01 — No existe página/ruta de Favoritos
- El menú móvil (BUG-12) incluye "Favoritos ♡ {favCount}" pero apunta a `/` como placeholder porque no hay ruta `/favoritos` ni filtro por favoritos en `Buscar.jsx`.
- Propuesta: crear `pages/Favoritos.jsx` (leer ids de `FavoritosContext`, fetch en lote como `Comparar.jsx`, reutilizar `Card.jsx`) + ruta en `App.jsx` + tab desktop.

### FE-NEW-02 — En móvil el overlay "+N" oculta la primera foto (GaleriaFotos.jsx:36-41)
- Con `total > 1` el botón `absolute inset-0 bg-black/55` cubre el 100 % de la foto principal (ej. 2 fotos → "+1 ver más" tapa la foto 1; solo se ve dentro del visor).
- Propuesta: en móvil mostrar overlay solo si `total > 3`, o convertirlo en chip `absolute bottom-2 right-2` en vez de cubrir todo.

### FE-NEW-03 — MapaZona muestra 320 m inventados cuando la publicación no informa distancia
- `Detalle.jsx:183` pasa `dist_m={dist ?? 320}`; el popup y el subtítulo del mapa afirman "~320 m" aunque el resto de la ficha dice "No informado".
- Propuesta: aceptar `dist_m={null}` en `MapaZona.jsx`, ocultar popup de distancia y mostrar "Distancia no informada" en el subtítulo.
