"""IP para límites de intentos detrás de proxies de confianza (core/net.py)."""
from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.core.net import ip_para_limites


def _req(xff=None, conexion="10.0.0.5"):
    headers = {"x-forwarded-for": xff} if xff is not None else {}
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host=conexion))


@pytest.fixture()
def saltos(monkeypatch):
    def fijar(n):
        monkeypatch.setattr(settings, "TRUSTED_PROXY_HOPS", n)
    return fijar


def test_sin_proxies_ignora_la_cabecera(saltos):
    saltos(0)
    assert ip_para_limites(_req("203.0.113.7")) == "10.0.0.5"


def test_un_proxy_toma_la_ip_que_anadio_el_proxy(saltos):
    saltos(1)
    assert ip_para_limites(_req("203.0.113.7")) == "203.0.113.7"


def test_las_entradas_que_escribe_el_cliente_no_cuentan(saltos):
    saltos(1)
    # El cliente envía su propio X-Forwarded-For; el proxy añade la real al final.
    assert ip_para_limites(_req("1.2.3.4, 5.6.7.8, 198.51.100.9")) == "198.51.100.9"


def test_dos_proxies_cuentan_desde_la_derecha(saltos):
    saltos(2)
    assert ip_para_limites(_req("1.2.3.4, 198.51.100.9, 10.1.1.1")) == "198.51.100.9"


def test_cabecera_corta_o_invalida_usa_la_conexion(saltos):
    saltos(2)
    assert ip_para_limites(_req("198.51.100.9")) == "10.0.0.5"
    saltos(1)
    assert ip_para_limites(_req("no-es-ip")) == "10.0.0.5"
    assert ip_para_limites(_req()) == "10.0.0.5"
