"""Regla de verificación del teléfono, independiente de Telegram (sin PG)."""
import asyncio
from types import SimpleNamespace

import pytest

from app.services import verificacion_telefono as v


class _Res:
    def __init__(self, valor):
        self._valor = valor

    def scalar(self):
        return self._valor


class _Db:
    """Responde en orden: [uso del teléfono, uso del chat]."""

    def __init__(self, *respuestas):
        self._respuestas = list(respuestas)

    async def execute(self, stmt):
        return _Res(self._respuestas.pop(0) if self._respuestas else None)


def _usuario(whatsapp="573009991234"):
    return SimpleNamespace(id=7, telefono_whatsapp=whatsapp, telefono_verificado=False, telegram_chat_id=None)


def _motivo(db, usuario, telefono="+57 300 999 1234"):
    return asyncio.run(v.motivo_rechazo(db, usuario, telefono, "555"))


def test_procede_si_coincide_y_nadie_lo_usa():
    assert _motivo(_Db(None, None), _usuario()) is None


def test_sin_telefono_guardado():
    assert _motivo(_Db(), _usuario(whatsapp=None)) == v.SIN_TELEFONO


@pytest.mark.parametrize("respuestas", [(99,), (None, 99)])
def test_telefono_o_chat_de_otra_cuenta_es_duplicado(respuestas):
    assert _motivo(_Db(*respuestas), _usuario()) == v.DUPLICADO


def test_numero_distinto():
    assert _motivo(_Db(None, None), _usuario(), telefono="+573001112233") == v.NUMERO_DISTINTO


def test_bd_caida_propaga_el_error():
    class _Rota:
        async def execute(self, stmt):
            raise RuntimeError("PG caído")
    with pytest.raises(RuntimeError):
        _motivo(_Rota(), _usuario())


def test_marcar_verificado():
    u = _usuario()
    v.marcar_verificado(u, 555)
    assert u.telefono_verificado is True and u.telegram_chat_id == "555"
