"""ajustes_repo sin PostgreSQL: respaldo con DEFAULTS, caché e invalidación."""
import asyncio

import pytest

from app.core import errores
from app.repositories import ajustes_repo


class _Resultado:
    def __init__(self, filas):
        self._filas = filas

    def all(self):
        return self._filas


class _SesionFalsa:
    """Imita lo que usa `leer_todos`: begin_nested() + execute()."""

    def __init__(self, filas=None, falla=False):
        self.filas, self.falla, self.consultas = filas or [], falla, 0

    def begin_nested(self):
        sesion = self

        class _Savepoint:
            async def __aenter__(self):
                if sesion.falla:
                    raise ConnectionError("BD caída")

            async def __aexit__(self, *exc):
                return False

        return _Savepoint()

    async def execute(self, _consulta):
        self.consultas += 1
        return _Resultado(self.filas)


@pytest.fixture(autouse=True)
def _cache_vacia():
    ajustes_repo.limpiar_cache()
    yield
    ajustes_repo.limpiar_cache()


def test_bd_caida_devuelve_defaults_sin_cachear():
    caida = _SesionFalsa(falla=True)
    valores = asyncio.run(ajustes_repo.leer_todos(caida))
    assert valores == ajustes_repo.valores_por_defecto()
    # El fallo no queda en caché: la siguiente lectura vuelve a ir a la BD.
    sana = _SesionFalsa(filas=[("titulo_min", "12")])
    assert asyncio.run(ajustes_repo.leer_todos(sana))["titulo_min"] == "12"


def test_la_bd_sobrescribe_solo_claves_conocidas_y_se_cachea():
    db = _SesionFalsa(filas=[("titulo_min", "12"), ("clave_rara", "x")])
    valores = asyncio.run(ajustes_repo.leer_todos(db))
    assert valores["titulo_min"] == "12" and "clave_rara" not in valores
    asyncio.run(ajustes_repo.leer_todos(db))
    assert db.consultas == 1
    ajustes_repo.limpiar_cache()
    asyncio.run(ajustes_repo.leer_todos(db))
    assert db.consultas == 2


def test_lectores_tipados_con_valor_invalido_usan_el_default():
    db = _SesionFalsa(filas=[("max_reportes_para_pausa_automatica", "muchos"),
                             ("vistas_visibles_publico", "TRUE")])
    assert asyncio.run(ajustes_repo.leer_entero(db, "max_reportes_para_pausa_automatica")) == 3
    assert asyncio.run(ajustes_repo.leer_bool(db, "vistas_visibles_publico")) is True


@pytest.mark.parametrize("clase, status", [
    (errores.DatoInvalido, 400), (errores.NoEncontrado, 404),
    (errores.ErrorDeProveedor, 502), (errores.ServicioNoDisponible, 503),
])
def test_status_http_de_cada_error(clase, status):
    error = clase("mensaje")
    assert errores.status_http(error) == status
    assert error.mensaje == "mensaje"


def test_error_de_dominio_llega_como_404_por_http():
    """`fetch_detail_campus_ref` lanza NoEncontrado; el handler de main.py da 404."""
    from fastapi.testclient import TestClient
    from app.main import app

    r = TestClient(app).get("/api/publicaciones/1", params={"campus_id": 999999})
    assert r.status_code == 404
    assert r.json() == {"detail": "campus_id 999999 no existe o inactivo"}
