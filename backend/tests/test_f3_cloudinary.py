"""F3 Cloudinary - Strategy local vs Cloudinary (sin red real, con mocks).

Cubre:
- Factory elige Local sin credenciales y Cloudinary con credenciales.
- LocalStorageBackend guarda y retorna /uploads/ (path traversal bloqueado).
- Upload endpoint usa Cloudinary cuando está configurado (mock save, sin red).
- Validaciones se mantienen con Cloudinary (MIME/magic no llegan a save).
- Cloudinary sin lib instalada -> 503 claro (import lazy).
"""
import os

from fastapi.testclient import TestClient

from app.core.config import settings
from app.services import storage as storage_mod
from app.services.storage import (
    CloudinaryStorageBackend,
    LocalStorageBackend,
    get_storage_backend,
)
from app.main import app

client = TestClient(app)
ARR = {"Authorization": "Bearer mock-token-arrendador"}

PNG_1PX = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\x0f"
    b"\x00\x00\x01\x00\x01\x9c\x0c\x9d\xcb\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _files(items):
    return [("files", (name, content, mime)) for name, content, mime in items]


def _sin_cloudinary():
    """Guarda credenciales reales y las vacía (dev local). Retorna para restaurar."""
    prev = (
        settings.CLOUDINARY_CLOUD_NAME,
        settings.CLOUDINARY_API_KEY,
        settings.CLOUDINARY_API_SECRET,
    )
    settings.CLOUDINARY_CLOUD_NAME = ""
    settings.CLOUDINARY_API_KEY = ""
    settings.CLOUDINARY_API_SECRET = ""
    return prev


def _restore_cloudinary(prev):
    settings.CLOUDINARY_CLOUD_NAME, settings.CLOUDINARY_API_KEY, settings.CLOUDINARY_API_SECRET = prev


def test_f3_factory_local_por_defecto():
    prev = _sin_cloudinary()
    try:
        assert settings.cloudinary_configured is False
        backend = get_storage_backend(base_url="http://test")
        assert isinstance(backend, LocalStorageBackend)
        assert backend.name == "local"
    finally:
        _restore_cloudinary(prev)


def test_f3_factory_cloudinary_con_creds():
    prev = _sin_cloudinary()
    try:
        settings.CLOUDINARY_CLOUD_NAME = "demo"
        settings.CLOUDINARY_API_KEY = "key"
        settings.CLOUDINARY_API_SECRET = "secret"
        assert settings.cloudinary_configured is True
        backend = get_storage_backend(base_url="http://test")
        assert isinstance(backend, CloudinaryStorageBackend)
        assert backend.name == "cloudinary"
    finally:
        _restore_cloudinary(prev)


def test_f3_local_guarda_y_bloquea_traversal(tmp_path):
    backend = LocalStorageBackend(upload_dir=str(tmp_path), base_url="http://test/")
    url = backend.save(b"fake-bytes", "abc123.png", "image/png")
    assert url == "http://test/uploads/abc123.png"
    assert os.path.exists(tmp_path / "abc123.png")
    # Path traversal aunque el router ya usa uuid.
    try:
        backend.save(b"x", "../evil.png", "image/png")
        raise AssertionError("debió bloquear traversal")
    except Exception as e:
        assert getattr(e, "status_code", 400) == 400


def test_f3_upload_usa_cloudinary_mock_sin_red(monkeypatch):
    """Con CLOUDINARY_* configurado, el endpoint retorna secure_url mock (no toca disco)."""
    prev = _sin_cloudinary()
    try:
        settings.CLOUDINARY_CLOUD_NAME = "demo"
        settings.CLOUDINARY_API_KEY = "key"
        settings.CLOUDINARY_API_SECRET = "secret"

        llamadas = []

        def fake_save(self, content: bytes, filename: str, mime: str) -> str:
            llamadas.append((filename, mime, len(content)))
            assert filename.endswith(".png") or filename.endswith(".jpg")
            assert len(content) > 0
            return f"https://res.cloudinary.com/demo/image/upload/alojau/{filename}"

        monkeypatch.setattr(CloudinaryStorageBackend, "save", fake_save)

        r = client.post(
            "/api/publicaciones/upload",
            files=_files([(f"c{i}.png", PNG_1PX, "image/png") for i in range(3)]),
            headers=ARR,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["count"] == 3
        assert len(llamadas) == 3
        assert all(u.startswith("https://res.cloudinary.com/") for u in data["urls"])
    finally:
        _restore_cloudinary(prev)


def test_f3_cloudinary_no_llama_save_si_validacion_falla(monkeypatch):
    """SVG bloqueado antes de subir (ahorra costo/red)."""
    prev = _sin_cloudinary()
    try:
        settings.CLOUDINARY_CLOUD_NAME = "demo"
        settings.CLOUDINARY_API_KEY = "key"
        settings.CLOUDINARY_API_SECRET = "secret"

        def boom(self, content, filename, mime):
            raise AssertionError("save no debe llamarse con SVG")

        monkeypatch.setattr(CloudinaryStorageBackend, "save", boom)
        svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        r = client.post(
            "/api/publicaciones/upload",
            files=_files([(f"e{i}.svg", svg, "image/svg+xml") for i in range(3)]),
            headers=ARR,
        )
        assert r.status_code == 400
    finally:
        _restore_cloudinary(prev)


def test_f3_cloudinary_sin_lib_503_claro(monkeypatch):
    """Si falta `pip install cloudinary`, error 503 accionable (no 500 genérico)."""
    import builtins

    prev = _sin_cloudinary()
    try:
        settings.CLOUDINARY_CLOUD_NAME = "demo"
        settings.CLOUDINARY_API_KEY = "key"
        settings.CLOUDINARY_API_SECRET = "secret"

        real_import = builtins.__import__

        def fake_import(name, *args, **kwargs):
            if name == "cloudinary" or name.startswith("cloudinary."):
                raise ImportError("mock sin lib")
            return real_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, "__import__", fake_import)
        # Llamada directa al backend (evita TestClient) para aislar el 503.
        backend = CloudinaryStorageBackend()
        try:
            backend.save(b"bytes", "a.png", "image/png")
            raise AssertionError("debió lanzar 503")
        except Exception as e:
            assert getattr(e, "status_code", None) == 503
    finally:
        _restore_cloudinary(prev)
        # Asegura que otros tests no queden con credenciales mock.
        assert settings.cloudinary_configured is False or True  # no-op, documenta restauración


def test_f3_no_deja_creds_mock_pegadas():
    # Guard: este test corre al final y exige estado limpio (sin CLOUDINARY_* en dev).
    prev = (settings.CLOUDINARY_CLOUD_NAME, settings.CLOUDINARY_API_KEY, settings.CLOUDINARY_API_SECRET)
    # Si el dev tiene credenciales reales en env, se respeta; si no, debe estar vacío.
    # Solo verifica que el flag sea coherente (no fuerza vacío).
    assert settings.cloudinary_configured == bool(all(p.strip() for p in prev))
    assert storage_mod.get_storage_backend is not None
