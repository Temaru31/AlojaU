"""F2 seguridad - uploads estrictos (SVG bloqueado, MIME/ext, magic-bytes, chunks)."""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
ARR = {"Authorization": "Bearer mock-token-arrendador"}

PNG_1PX = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\x0f"
    b"\x00\x00\x01\x00\x01\x9c\x0c\x9d\xcb\x00\x00\x00\x00IEND\xaeB`\x82"
)
JPG_MIN = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + b"\x00" * 64
SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'


def _files(items):
    return [("files", (name, content, mime)) for name, content, mime in items]


def test_f2_svg_bloqueado_400():
    r = client.post(
        "/api/publicaciones/upload",
        files=_files([(f"evil{i}.svg", SVG, "image/svg+xml") for i in range(3)]),
        headers=ARR,
    )
    assert r.status_code == 400


def test_f2_mime_ext_incoherente_400():
    r = client.post(
        "/api/publicaciones/upload",
        files=_files([(f"f{i}.png", PNG_1PX, "image/jpeg") for i in range(3)]),
        headers=ARR,
    )
    assert r.status_code == 400


def test_f2_contenido_falso_400():
    r = client.post(
        "/api/publicaciones/upload",
        files=_files([(f"f{i}.png", b"soy texto plano, no PNG" + b"x" * 64, "image/png") for i in range(3)]),
        headers=ARR,
    )
    assert r.status_code == 400


def test_f2_upload_valido_200_conteo():
    r = client.post(
        "/api/publicaciones/upload",
        files=_files(
            [(f"a{i}.png", PNG_1PX, "image/png") for i in range(2)]
            + [("b.jpg", JPG_MIN, "image/jpeg")]
        ),
        headers=ARR,
    )
    assert r.status_code == 200
    assert r.json()["count"] == 3
    assert len(r.json()["urls"]) == 3


def test_f2_menos_de_3_fotos_422():
    r = client.post(
        "/api/publicaciones/upload",
        files=_files([("solo.png", PNG_1PX, "image/png")]),
        headers=ARR,
    )
    assert r.status_code == 422
