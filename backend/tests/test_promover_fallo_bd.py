"""POST /api/auth/promover: un fallo de BD responde 503, no 404 "Usuario no encontrado"."""
import asyncio

import pytest
from fastapi import HTTPException

from app.routers.auth import sesiones_cuenta
from app.services import role_lifecycle


class _DbFalsa:
    def __init__(self):
        self.rollbacks = 0
        self.commits = 0

    async def rollback(self):
        self.rollbacks += 1

    async def commit(self):
        self.commits += 1


def _promover(monkeypatch, efecto):
    async def falso(db, uid):
        return efecto()
    monkeypatch.setattr(role_lifecycle, "promover_si_estudiante", falso)
    db = _DbFalsa()
    try:
        return asyncio.run(sesiones_cuenta.promoverme({"id": 7, "sub": "x@y.co"}, db)), db
    except HTTPException as e:
        return e, db


def test_fallo_de_bd_responde_503_y_revierte(monkeypatch):
    def caida():
        raise RuntimeError("conexión perdida")
    err, db = _promover(monkeypatch, caida)
    assert isinstance(err, HTTPException) and err.status_code == 503
    assert db.rollbacks == 1 and db.commits == 0


def test_usuario_inexistente_responde_404(monkeypatch):
    err, db = _promover(monkeypatch, lambda: None)
    assert isinstance(err, HTTPException) and err.status_code == 404
    assert db.commits == 0


def test_promocion_ok_hace_commit(monkeypatch):
    out, db = _promover(monkeypatch, lambda: "ARRENDADOR")
    assert out["rol"] == "ARRENDADOR" and db.commits == 1


def test_id_propietario_exige_entero():
    from app.core.security import id_propietario
    assert id_propietario({"id": 5}) == 5
    for malo in ({}, {"id": "5"}, {"id": None}):
        with pytest.raises(HTTPException) as e:
            id_propietario(malo)
        assert e.value.status_code == 401
