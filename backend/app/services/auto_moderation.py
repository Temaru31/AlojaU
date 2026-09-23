"""v15.2 auto-moderación AI-ready (motor de reglas + hook de proveedor IA).

Fase 1 (activa): reglas programáticas puras, sin dependencias externas:
  - calidad textual (longitudes configurables, repetición, mayúsculas,
    palabras prohibidas configurables).
  - imágenes base (mínimo configurable, extensiones permitidas).
Fase 2 (hook): `BaseAIModerationProvider.evaluate_publication()` con
  `HeuristicAIModerator` de referencia. Un proveedor real (OpenAI, Vertex,
  local) implementa la interfaz sin tocar el flujo.
Auto-aprobación: SOLO si `moderacion_automatica=true` Y reglas OK Y
  `confidence >= umbral_aprobacion_ia`. Si no: PENDIENTE (revisión humana).
  El evento de audit distingue auto (`detalle="auto:..."`, usuario NULL).
"""
from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

# --- Resultado estándar (firma estable para proveedores futuros) ---
APPROVE = "APPROVE"
REJECT = "REJECT"
MANUAL_REVIEW = "MANUAL_REVIEW"


@dataclass
class ModerationResult:
    """Contrato de `evaluate_publication` (reglas y proveedores IA)."""

    decision: str = MANUAL_REVIEW
    confidence_score: float = 0.0  # 0.0 a 1.0
    labels: dict[str, Any] = field(default_factory=dict)
    motivos: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "decision": self.decision,
            "confidence_score": round(float(self.confidence_score), 3),
            "labels": dict(self.labels),
            "motivos": list(self.motivos),
        }


EXTENSIONES_PERMITIDAS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
PALABRAS_DEFECTO = ["viagra", "casino", "cripto", "x1000"]


def _cfg_valores(db_rows: dict[str, str] | None = None) -> dict[str, str]:
    """Defaults + overrides de system_settings (testeable sin DB)."""
    from app.routers.admin_automation import DEFAULTS
    base = {k: v for k, (v, _t, _d, _s) in DEFAULTS.items()}
    if db_rows:
        base.update({k: v for k, v in db_rows.items() if k in base})
    return base


async def leer_config_moderacion(db) -> dict[str, str]:
    """Lee system_settings (una query). Sin tabla -> defaults (sin cachear)."""
    try:
        from sqlalchemy import select as _select
        from app.models import SystemSetting as _SS
        rows = (await db.execute(_select(_SS))).scalars().all()
        return _cfg_valores({r.clave: r.valor for r in rows})
    except Exception:
        return _cfg_valores(None)


def _num(cfg: dict[str, str], clave: str, default: float) -> float:
    try:
        return float(cfg.get(clave, default))
    except (TypeError, ValueError):
        return default


def _tiene_repeticion(texto: str, umbral: int = 5) -> bool:
    """True si algún carácter se repite `umbral`+ veces seguidas (spam)."""
    return bool(re.search(r"(.)\1{" + str(umbral - 1) + r",}", texto or ""))


def _ratio_mayusculas(texto: str) -> float:
    letras = [c for c in (texto or "") if c.isalpha()]
    if not letras:
        return 0.0
    return sum(1 for c in letras if c.isupper()) / len(letras)


def validar_texto(titulo: str, descripcion: str, cfg: dict[str, str]) -> list[str]:
    """Reglas programáticas de calidad textual. Retorna lista de motivos."""
    motivos: list[str] = []
    tmin, tmax = int(_num(cfg, "titulo_min", 10)), int(_num(cfg, "titulo_max", 150))
    dmin, dmax = int(_num(cfg, "descripcion_min", 20)), int(_num(cfg, "descripcion_max", 2000))
    titulo, descripcion = (titulo or "").strip(), (descripcion or "").strip()
    if not (tmin <= len(titulo) <= tmax):
        motivos.append(f"titulo_longitud (debe tener {tmin}-{tmax} caracteres)")
    if not (dmin <= len(descripcion) <= dmax):
        motivos.append(f"descripcion_longitud (debe tener {dmin}-{dmax} caracteres)")
    if _tiene_repeticion(titulo) or _tiene_repeticion(descripcion):
        motivos.append("repeticion_excesiva (spam de caracteres)")
    if len(titulo) >= tmin and _ratio_mayusculas(titulo) > 0.7:
        motivos.append("mayusculas_excesivas (título en grito)")
    prohibidas = [p.strip().lower() for p in
                  str(cfg.get("palabras_prohibidas", "")).split(",") if p.strip()]
    corpus = f"{titulo}\n{descripcion}".lower()
    halladas = sorted({p for p in prohibidas if p and p in corpus})
    if halladas:
        motivos.append(f"palabras_prohibidas: {', '.join(halladas[:5])}")
    return motivos


def validar_imagenes(fotos: list[str], cfg: dict[str, str]) -> list[str]:
    """Reglas base de imágenes (conteo + extensiones). Sin Pillow a propósito."""
    motivos: list[str] = []
    fotos = [f for f in (fotos or []) if str(f or "").strip()]
    fmin = int(_num(cfg, "fotos_min_publicar", 3))
    if len(fotos) < fmin:
        motivos.append(f"fotos_insuficientes (mínimo {fmin})")
    malas = []
    for f in fotos:
        try:
            ext = "." + str(f).split("?")[0].rsplit(".", 1)[1].lower()
        except IndexError:
            ext = ""
        if ext not in EXTENSIONES_PERMITIDAS:
            malas.append(f[:40])
    if malas:
        motivos.append(f"extensiones_no_permitidas: {len(malas)} archivo(s)")
    return motivos


class BaseAIModerationProvider(ABC):
    """Interfaz para proveedores de moderación IA (Fase 2).

    Implementaciones futuras (OpenAI moderation, Vertex, modelo local)
    heredan y sobreescriben `evaluate_publication`. El flujo
    (`evaluar_y_aplicar`) no cambia.
    """

    @abstractmethod
    async def evaluate_publication(
        self, publicacion_data: dict[str, Any], imagenes: list[str]
    ) -> ModerationResult:
        """Evalúa un aviso. Retorna decisión + score + etiquetas."""


class HeuristicAIModerator(BaseAIModerationProvider):
    """Proveedor de referencia (sin red ni API keys): reglas + heurísticas.

    - Fallo duro de reglas (spam/prohibidas/fotos) -> REJECT, score bajo.
    - Sin fallos -> score por riqueza (longitud, fotos, precio coherente);
      la DECISIÓN final la toma `evaluar_y_aplicar` contra el umbral.
    """

    async def evaluate_publication(
        self, publicacion_data: dict[str, Any], imagenes: list[str]
    ) -> ModerationResult:
        cfg = publicacion_data.get("_cfg") or _cfg_valores(None)
        data = dict(publicacion_data)
        motivos = validar_texto(data.get("titulo", ""), data.get("descripcion", ""),
                                cfg)
        motivos += validar_imagenes(list(imagenes or []), cfg)
        duros = [m for m in motivos if m.startswith(
            ("palabras_prohibidas", "repeticion_excesiva", "fotos_insuficientes"))]
        if duros:
            return ModerationResult(
                decision=REJECT, confidence_score=0.15,
                labels={"contains_inappropriate_content": True,
                        "property_relevance_score": 0.2,
                        "hard_fail": True},
                motivos=duros,
            )
        if motivos:
            return ModerationResult(
                decision=MANUAL_REVIEW, confidence_score=0.5,
                labels={"contains_inappropriate_content": False,
                        "property_relevance_score": 0.6},
                motivos=motivos,
            )
        # Score por riqueza: descripción larga + fotos + precio > 0.
        score = 0.7
        if len((data.get("descripcion") or "")) > 200:
            score += 0.1
        if len(list(imagenes or [])) >= 4:
            score += 0.1
        try:
            if float(data.get("canon_mensual") or 0) > 0:
                score += 0.05
        except (TypeError, ValueError):
            pass
        return ModerationResult(
            decision=MANUAL_REVIEW, confidence_score=round(min(score, 0.99), 3),
            labels={"contains_inappropriate_content": False,
                    "property_relevance_score": 0.9},
            motivos=[],
        )


async def evaluar_y_aplicar(db, publicacion, proveedor: BaseAIModerationProvider | None = None,
                            cfg: dict[str, str] | None = None) -> ModerationResult:
    """Ejecuta moderación y, si corresponde, auto-aprueba en la transacción.

    - Flag `moderacion_automatica=false` (default) -> no-op: PENDIENTE intacto.
    - APPROVE + score >= umbral -> estado ACTIVO + audit APPROVED auto.
    - Lo demás -> PENDIENTE (revisión humana). Hace flush; el commit es del
      llamador (misma transacción del endpoint).
    """
    from app.models import PublicacionesAudit

    if cfg is None:
        cfg = await leer_config_moderacion(db)
    if str(cfg.get("moderacion_automatica", "false")).lower() != "true":
        return ModerationResult(decision=MANUAL_REVIEW, confidence_score=0.0,
                                labels={"auto": False}, motivos=["moderacion_off"])
    proveedor = proveedor or HeuristicAIModerator()
    fotos = [im.url for im in getattr(publicacion, "imagenes", []) or []]
    data = {"titulo": publicacion.titulo, "descripcion": publicacion.descripcion,
            "canon_mensual": float(publicacion.canon_mensual or 0), "_cfg": cfg}
    res = await proveedor.evaluate_publication(data, fotos)
    umbral = _num(cfg, "umbral_aprobacion_ia", 0.85)
    if res.decision != REJECT and res.confidence_score >= umbral:
        publicacion.estado = "ACTIVO"
        db.add(PublicacionesAudit(
            publicacion_id=publicacion.id, usuario_id=None, evento="APPROVED",
            detalle=f"auto:rules+heuristic score={res.confidence_score:.3f} umbral={umbral}",
        ))
        await db.flush()
        res.decision = APPROVE
    return res
