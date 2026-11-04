"""Canales de notificación intercambiables: `despachar` no conoce canales concretos."""
import asyncio

from app.services import notifications as nt


class _CanalFalso:
    def __init__(self, nombre, destino, ok=True):
        self.nombre = nombre
        self._destino = destino
        self._ok = ok
        self.enviados = []

    async def destino_para(self, db, usuario_id):
        return self._destino

    async def enviar(self, destino, texto):
        self.enviados.append((destino, texto))
        return self._ok


def test_canal_nuevo_sin_tocar_despachar():
    correo = _CanalFalso("correo", "ana@uni.edu.co")
    sin_destino = _CanalFalso("push", None)
    res = asyncio.run(nt.despachar(None, 7, "hola", canales=[correo, sin_destino]))
    assert res == {"correo": True, "push": False}
    assert correo.enviados == [("ana@uni.edu.co", "hola")]
    assert sin_destino.enviados == []  # sin destino no se intenta enviar


def test_un_canal_que_falla_no_tumba_a_los_demas():
    class _Roto(_CanalFalso):
        async def enviar(self, destino, texto):
            raise RuntimeError("caído")

    bueno = _CanalFalso("log", "usuario:7")
    res = asyncio.run(nt.despachar(None, 7, "hola", canales=[_Roto("roto", "x"), bueno]))
    assert res == {"roto": False, "log": True}


def test_cambio_estado_reporta_el_nombre_logico(monkeypatch):
    async def falso(db, usuario_id, texto, canales=None):
        return {nt.CanalTelegram.nombre: True}
    monkeypatch.setattr(nt, "despachar", falso)
    assert asyncio.run(nt.notificar_cambio_estado(None, 7, "Aviso", "ACTIVO")) == "telegram"
