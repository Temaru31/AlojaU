"""Los guards de auth usan la sesión inyectada (Depends) y no exponen `db` como query param."""
import asyncio

import pytest
from fastapi import HTTPException

from app.core import security as sec
from app.main import app


class _Resultado:
    def __init__(self, valor):
        self._valor = valor

    def scalar(self):
        return self._valor


class _SesionEspia:
    """Sesión falsa: responde `valor` a cualquier consulta y cuenta las llamadas."""

    def __init__(self, valor):
        self.valor = valor
        self.consultas = 0

    async def execute(self, stmt):
        self.consultas += 1
        return _Resultado(self.valor)


def test_ninguna_ruta_expone_db_como_query_param():
    def params(dep):
        yield from (q.name for q in dep.query_params)
        for sub in dep.dependencies:
            yield from params(sub)

    con_db = [r.path for r in app.routes if getattr(r, "dependant", None) and "db" in params(r.dependant)]
    assert con_db == []


def test_require_admin_consulta_el_rol_en_la_sesion_inyectada():
    db = _SesionEspia("ADMIN")
    u = asyncio.run(sec.require_admin("Bearer mock-token-admin", db))
    assert u["rol"] == "ADMIN" and db.consultas == 1


def test_require_admin_democionado_en_bd_da_403():
    db = _SesionEspia("ESTUDIANTE")
    with pytest.raises(HTTPException) as e:
        asyncio.run(sec.require_admin("Bearer mock-token-admin", db))
    assert e.value.status_code == 403


def test_revocacion_usa_la_sesion_inyectada():
    db = _SesionEspia(True)  # sesiones.revocado = true
    with pytest.raises(HTTPException) as e:
        asyncio.run(sec._verificar_sesion_activa({"jti": "abc"}, db))
    assert e.value.status_code == 401 and db.consultas == 1


def test_storage_inyectado_sustituible_en_el_avatar():
    """El avatar guarda en el StorageBackend inyectado (sin tocar disco ni Cloudinary)."""
    import uuid

    from fastapi.testclient import TestClient

    from app.routers import auth as _a
    from app.services.storage import StorageBackend, get_storage

    class _StorageMemoria(StorageBackend):
        def __init__(self):
            self.guardados = []

        def save(self, content, filename, mime):
            self.guardados.append((filename, mime, len(content)))
            return f"https://cdn.falso/{filename}"

    falso = _StorageMemoria()
    app.dependency_overrides[get_storage] = lambda: falso
    _a._AVATAR_MEM.clear()
    try:
        client = TestClient(app)
        email = f"di_{uuid.uuid4().hex[:8]}@alojau.com"
        assert client.post("/api/auth/register", json={
            "email": email, "password": "Fuerte1!x", "nombre_completo": "Inyeccion Storage",
            "acepto_tratamiento_datos": True}).status_code in (200, 201)
        tok = client.post("/api/auth/login", json={"email": email, "password": "Fuerte1!x"}).json()["access_token"]
        png = (b"\x89PNG\r\n\x1a\n" + b"\x00" * 64)
        r = client.post("/api/auth/avatar", headers={"Authorization": f"Bearer {tok}"},
                        files={"file": ("a.png", png, "image/png")})
        assert r.status_code == 200, r.text
        assert r.json()["foto_perfil_url"].startswith("https://cdn.falso/avatar-")
        assert falso.guardados and falso.guardados[0][1] == "image/png"
    finally:
        app.dependency_overrides.pop(get_storage, None)
        _a._AVATAR_MEM.clear()
