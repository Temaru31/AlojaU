"""Memoria acotada de los límites en memoria y de los vínculos de Telegram."""
import time

import pytest
from fastapi import HTTPException

from app.core import rate_limit
from app.core.rate_limit import registrar_intento


def test_poda_claves_inactivas_al_pasar_el_tope(monkeypatch):
    monkeypatch.setattr(rate_limit, "MAX_CLAVES", 3)
    viejo = time.monotonic() - 1000
    historial = {f"ip:{i}": [viejo] for i in range(5)}
    historial["ip:activa"] = [time.monotonic()]
    registrar_intento(historial, "ip:nueva", 5, 60.0, "x")
    assert set(historial) == {"ip:activa", "ip:nueva"}


def test_bajo_el_tope_no_poda_y_el_limite_sigue_igual():
    historial = {"ip:vieja": [time.monotonic() - 1000]}
    for _ in range(2):
        registrar_intento(historial, "ip:a", 2, 60.0, "x")
    with pytest.raises(HTTPException) as e:
        registrar_intento(historial, "ip:a", 2, 60.0, "x")
    assert e.value.status_code == 429 and "ip:vieja" in historial


def test_purga_vinculos_vencidos_conserva_pendientes_de_pg():
    from app.routers.auth import telegram_vinculo as tv
    ahora = int(time.time())
    tv._TELEGRAM_VINCULOS.clear(); tv._TELEGRAM_USADOS.clear(); tv._TELEGRAM_PENDIENTES.clear()
    tv._TELEGRAM_VINCULOS.update({"vencido": {"user_id": 1, "exp": ahora - 5, "usado": True},
                                  "vivo": {"user_id": 2, "exp": ahora + 600, "usado": False}})
    tv._TELEGRAM_USADOS.add("vencido")
    tv._TELEGRAM_PENDIENTES.update({"c1": "vencido", "c2": "solo_en_pg"})
    tv._purgar_vinculos_vencidos(ahora)
    assert set(tv._TELEGRAM_VINCULOS) == {"vivo"}
    assert "vencido" not in tv._TELEGRAM_USADOS
    assert tv._TELEGRAM_PENDIENTES == {"c2": "solo_en_pg"}
    tv._TELEGRAM_VINCULOS.clear(); tv._TELEGRAM_PENDIENTES.clear()
