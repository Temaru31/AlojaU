"""Invocación directa en hilo principal: mismo código y misma BD real.

Contexto: coverage solo mide el hilo principal; el portal de TestClient
ejecuta los handlers en otro hilo. Estos tests llaman servicios, repos y
seguridad directamente (vía asyncio.run) para medir honestamente lo que los
tests HTTP ya verifican conductualmente. Sin mocks de lógica propia.
"""
import asyncio
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import select


def run(coro):
    return asyncio.run(coro)


async def _nueva_sesion():
    from app.db.session import AsyncSession
    async with AsyncSession() as db:
        yield db


def con_db(fn):
    async def main():
        from app.db.session import AsyncSession
        async with AsyncSession() as db:
            return await fn(db)
    return asyncio.run(main())


@pytest.fixture()
def stores_limpios():
    from app.routers import auth as _a
    from app.core import security as _s
    _a._LOGIN_ATTEMPTS.clear()
    _a._PW_ATTEMPTS.clear()
    _a._OTP_SOLICITAR.clear()
    _a._OTP_VERIFICAR.clear()
    _s.clear_rol_cache_for_tests()
    yield
    _a._LOGIN_ATTEMPTS.clear()
    _s.clear_rol_cache_for_tests()


# ---------------------------------------------------------------------------
# role_lifecycle
# ---------------------------------------------------------------------------
def _usuario_tmp(db, email, rol="ESTUDIANTE"):
    from app.models import Usuario
    from app.core.security import hash_password
    u = Usuario(nombre_completo="Tmp Directo", email=email,
                password_hash=hash_password("Tmp12345!x"), rol=rol)
    db.add(u)
    return u


def test_rl_promover_contar_democionar(stores_limpios):
    async def main(db):
        from app.services import role_lifecycle as rl
        from app.models import Usuario

        email = "directo_rl@alojau.com"
        u = _usuario_tmp(db, email)
        await db.commit()
        assert await rl.contar_vigentes(db, u.id) == 0
        assert await rl.promover_si_estudiante(db, u.id) == "ARRENDADOR"
        rol, demo = await rl.evaluar_democion(db, u.id)
        assert (rol, demo) == ("ESTUDIANTE", True)
        assert await rl.bloquear_dueno(db, 999999) is None
        assert await rl.evaluar_democion(db, 999999) == (None, False)
        # Roles no democionables y soft-delete se respetan.
        assert await rl.evaluar_democion(db, 2) == ("ADMIN", False)
        u2 = _usuario_tmp(db, "directo_rl2@alojau.com", rol="ARRENDADOR")
        await db.commit()
        u2.eliminado_en = datetime.now(timezone.utc)
        await db.flush()
        assert await rl.evaluar_democion(db, u2.id) == ("ARRENDADOR", False)
        b = await rl.bloquear_dueno(db, u.id)
        assert isinstance(b, Usuario)
    con_db(main)


# ---------------------------------------------------------------------------
# publicacion_repo
# ---------------------------------------------------------------------------
def test_repo_ciudades_lecturas_y_errores(stores_limpios):
    async def main(db):
        from app.repositories import publicacion_repo as repo
        from app.models import Publicacion

        assert await repo.resolver_ciudad_id(db, None, None) is None
        assert await repo.resolver_ciudad_id(db, 1, None) == 1
        assert await repo.resolver_ciudad_id(db, None, "popayan") == 1
        with pytest.raises(ValueError):
            await repo.resolver_ciudad_id(db, None, "bogota")
        assert await repo.leer_ajuste(db, "dias_vigencia_publicacion", "30") == "30"
        assert await repo.leer_ajuste(db, "clave_inexistente_xyz", "d") == "d"
        assert isinstance(await repo.vistas_publicas(db), bool)
        conds = repo.lista_conditions(Publicacion, None, None, None, None, None)
        assert await repo.count_total(db, conds, None) >= 6
        pubs = await repo.fetch_page(db, conds, None, 3, 0)
        assert len(pubs) == 3
        rep, users, dist = await repo.fetch_page_aggregates(db, pubs, None)
        assert isinstance(rep, dict) and isinstance(users, dict) and dist == {}
        p, n, u, d = await repo.fetch_detail_bundle(db, 1)
        assert p is not None and p.id == 1 and u is not None
        assert await repo.fetch_detail_bundle(db, 999999) == (None, 0, None, None)
    con_db(main)


def test_repo_q_modos_y_campus(stores_limpios):
    async def main(db):
        from app.repositories import publicacion_repo as repo

        assert repo.resolver_modo_q(None) is None
        assert repo.resolver_modo_q("  ") is None
        assert repo.resolver_modo_q("xy") == "fuzzy"
        assert repo.resolver_modo_q("habitación amplia") == "fts"
        total, pubs, *_ = await repo.query_lista(db, None, None, None, None, None, q="habitación")
        assert total >= 1 and pubs
        total2, pubs2, *_ = await repo.query_lista(db, None, None, None, None, None, q="xy")
        assert isinstance(total2, int)
        total3, pubs3, *_ = await repo.query_lista(db, None, None, None, None, None, q="con de la")
        assert total3 >= 1
        # Campus real del seed + ciudad + fts forzado.
        from app.models import CampusUniversitario
        campus = (await db.execute(select(CampusUniversitario).limit(1))).scalars().first()
        total4, pubs4, *_ = await repo.query_lista(db, campus.id, None, None, None, None)
        assert total4 >= 0
        dist, lugar = await repo.fetch_detail_campus_ref(db, 1, campus.id)
        assert lugar is not None
        with pytest.raises(HTTPException) as e:
            await repo.fetch_detail_campus_ref(db, 1, 999999)
        assert e.value.status_code == 404
    con_db(main)


def test_repo_validar_fks_y_persistir_y_renovar(stores_limpios):
    async def main(db):
        from app.repositories import publicacion_repo as repo
        from app.services import publicacion_view as view

        cids, sids = await repo.validate_fks(db, 1, [1, 1], [1])
        assert cids == [1] and sids == [1]
        with pytest.raises(HTTPException):
            await repo.validate_fks(db, 999999, [], [1])
        with pytest.raises(HTTPException):
            await repo.validate_fks(db, 1, [999999], [1])
        with pytest.raises(HTTPException):
            await repo.validate_fks(db, 1, [], [999999])
        payload = SimpleNamespace(
            zona_barrio_id=1, barrio_texto=None, titulo="Directa amplia con título largo",
            descripcion="Descripción directa con más de veinte caracteres",
            tipo_inmueble="APARTAESTUDIO", canon_mensual=500000, deposito_requerido=0,
            reglas_convivencia="Reglas directas válidas", direccion_referencial="Calle directa 123",
            latitud=None, longitud=None, fotos=["https://a.com/1.jpg", "https://a.com/2.jpg", "https://a.com/3.jpg"],
            servicios_ids=[1], campus_ids=[1])
        trust = view.initial_trust(payload, True)
        nueva = await repo.create_persisted(db, payload, 3, trust, [1], [1])
        assert nueva.estado == "PENDIENTE"
        datos = await repo.renovar_publicacion(db, nueva.id, 3)
        assert datos["dias_agregados"] == 30
        # Vencida: renueva desde ahora y EXPIRADO vuelve a ACTIVO.
        from app.models import Publicacion
        p = await db.get(Publicacion, nueva.id)
        p.fecha_expiracion = datetime.now(timezone.utc) - timedelta(days=1)
        p.estado = "EXPIRADO"
        await db.commit()
        datos2 = await repo.renovar_publicacion(db, nueva.id, 3)
        assert datos2["estado"] == "ACTIVO"
        with pytest.raises(HTTPException) as e403:
            await repo.renovar_publicacion(db, nueva.id, 1)
        assert e403.value.status_code == 403
        with pytest.raises(HTTPException) as e404:
            await repo.renovar_publicacion(db, 999999, 3)
        assert e404.value.status_code == 404
    con_db(main)


# ---------------------------------------------------------------------------
# publicacion_view
# ---------------------------------------------------------------------------
def test_view_cards_detail_y_mocks(stores_limpios):
    async def main(db):
        from app.models import Publicacion
        from app.services import publicacion_view as view
        from sqlalchemy.orm import selectinload

        p = (await db.execute(
            select(Publicacion).options(selectinload(Publicacion.imagenes),
                                        selectinload(Publicacion.servicios),
                                        selectinload(Publicacion.zona))
            .where(Publicacion.id == 1))).scalars().unique().one()
        assert view.whatsapp_link("T", 1, None) is None
        assert view.whatsapp_link("T", 1, "573001234567").startswith("https://wa.me/")
        trust = view.trust_for_row(p, 0, True)
        card = view.build_card(p, 111, trust, "Tulcán", "573001234567", True)
        assert card["fotos"][0] and card["usuario_id"] == 1
        det = view.build_detail(p, 0, p.usuario, 111, None, True)
        assert det["fotos"][0] == det["imagenes"][0]["url"]
        items = view.cards_for_page([p], {1: 0}, {p.usuario_id: p.usuario}, {1: 111}, 1, True)
        assert len(items) == 1
        assert view._zona_display(p) in ("Tulcán", "Pandiguando", "Centro")
        mock = {"id": 5, "titulo": "t", "tipo_inmueble": "X", "canon_mensual": 100,
                "zona_barrio_id": 1, "direccion_referencial": "d", "estado": "ACTIVO",
                "servicios": [], "servicios_ids": [1], "fotos": ["https://a/1.jpg"],
                "latitud": 2.44, "longitud": -76.60, "campus_ids": [1, 99],
                "usuario_id": 1, "telefono_verificado": False}
        out = view.mock_to_out(mock, 1, False)
        assert out["telefono_whatsapp"] is None and out["vistas"] is None
        assert out["campus_distancias"] is not None
        assert view.mock_to_out(mock, None, True)["vistas"] == 0
        assert view.filter_mock_pubs(
            [dict(mock, estado="ACTIVO", ciudad_id=2)], ciudad_id=1) == []
        assert view.filter_mock_pubs(
            [dict(mock, estado="ACTIVO")], ciudad_slug="bogota") == []
        assert view.filter_mock_pubs(
            [dict(mock, estado="ACTIVO")], q="con de la")
        assert view.filter_mock_pubs(
            [dict(mock, estado="ACTIVO")], tipo="APARTAESTUDIO") == []
        for malo in ("1,2,3' OR '1'='1", "x,y", "0", "1," * 30):
            with pytest.raises(HTTPException):
                view.parse_servicios_param(malo)
        assert view.parse_servicios_param(None) is None
        assert view.parse_servicios_param("1,3") == [1, 3]
    con_db(main)


# ---------------------------------------------------------------------------
# permissions
# ---------------------------------------------------------------------------
def test_permissions_roles_y_scopes(stores_limpios):
    from app.core import permissions as pm
    from fastapi import HTTPException

    assert pm.scopes_for_role("INVENTADO") == frozenset()
    assert pm.scopes_for_role(None) == frozenset()
    assert "publications:write" in pm.scopes_for_role("ARRENDADOR")
    assert pm.user_scopes(None) == frozenset()
    pm.register_role("TEST_X", ["analytics:view_own"])
    assert pm.scopes_for_role("TEST_X") == frozenset({"analytics:view_own"})
    with pytest.raises(ValueError):
        pm.register_role("TEST_Y", ["scope:inventado"])
    tramposo = {"rol": "ESTUDIANTE", "scopes": ["publications:write", "users:eliminar"]}
    assert "users:eliminar" not in pm.user_scopes(tramposo)
    assert "publications:write" not in pm.user_scopes(tramposo)
    assert pm.user_scopes({"rol": "ARRENDADOR"}) == pm.scopes_for_role("ARRENDADOR")
    dep = pm.require_scope("analytics:view_own")
    assert run(dep(user={"rol": "ARRENDADOR", "scopes": ["analytics:view_own"]}))["rol"] == "ARRENDADOR"
    with pytest.raises(HTTPException) as e:
        run(dep(user={"rol": "ESTUDIANTE", "scopes": []}))
    assert e.value.status_code == 403
    dep_any = pm.require_any_scope("a:x", "analytics:view_own")
    assert run(dep_any(user={"rol": "ARRENDADOR", "scopes": ["analytics:view_own"]}))
    with pytest.raises(HTTPException):
        run(dep_any(user={"rol": "ESTUDIANTE", "scopes": []}))


# ---------------------------------------------------------------------------
# security directo
# ---------------------------------------------------------------------------
def test_security_tokens_y_sesiones(stores_limpios):
    async def main(db):
        from app.core import security as sec
        from app.models import Sesion

        t = sec.create_token({"sub": "a@b.co", "rol": "ESTUDIANTE", "id": 99})
        claims = sec.decode_token(t)
        assert claims["sub"] == "a@b.co" and "scopes" in claims and "jti" in claims
        with pytest.raises(HTTPException):
            sec.decode_token("basura")
        viejo = sec.create_token({"sub": "a@b.co", "rol": "ESTUDIANTE", "id": 99})
        import jwt as _jwt
        from app.core.config import settings as _s
        expirado = _jwt.encode(
            {"sub": "a@b.co", "exp": datetime.now(timezone.utc) - timedelta(hours=1)},
            _s.SECRET_KEY, algorithm=_s.ALGORITHM)
        with pytest.raises(HTTPException):
            sec.decode_token(expirado)
        assert viejo  # usa helper de expiración real
        # get_current_user: mock, formato, ausente.
        assert (await sec.get_current_user("Bearer mock-token-arrendador"))["rol"] == "ARRENDADOR"
        with pytest.raises(HTTPException):
            await sec.get_current_user("Token roto")
        with pytest.raises(HTTPException):
            await sec.get_current_user(None)
        assert await sec.get_optional_user(None) is None
        assert await sec.get_optional_user("Bearer roto") is None
        legacy = await sec.get_optional_user(f"Bearer {t}")
        assert legacy["sub"] == "a@b.co"
        # JTI revocado -> 401; ausente -> ok.
        await sec._verificar_sesion_activa({"sub": "x"}, db)
        db.add(Sesion(usuario_id=1, jti="jti-rev", revocado=True))
        await db.commit()
        with pytest.raises(HTTPException):
            await sec._verificar_sesion_activa({"jti": "jti-rev"}, db)
        await sec._verificar_sesion_activa({"jti": "jti-nuevo"}, db)
    con_db(main)


def test_security_require_arrendador_caminos(stores_limpios):
    async def main(db):
        from app.core import security as sec

        u = await sec.require_arrendador("Bearer mock-token-arrendador")
        assert u["rol"] == "ARRENDADOR"
        # Token rancio ESTUDIANTE pero BD dice ARRENDADOR -> se actualiza.
        t = sec.create_token({"sub": "arrendador@alojau.com", "rol": "ESTUDIANTE", "id": 1})
        u2 = await sec.require_arrendador(f"Bearer {t}")
        assert u2["rol"] == "ARRENDADOR"
        # Segunda vez: cache de rol (sin tocar BD).
        u3 = await sec.require_arrendador(f"Bearer {t}")
        assert u3["rol"] == "ARRENDADOR"
        sec.clear_rol_cache_for_tests()
        # Sin BD (factoría rota) + mock: MOCK_USERS manda en dev.
        from app.db import session as _sess

        real = _sess.AsyncSession

        class _Rota:
            def __init__(self, *a, **k):
                raise RuntimeError("fábrica rota")

        _sess.AsyncSession = _Rota
        try:
            u4 = await sec.require_arrendador(f"Bearer {t}")
            assert u4["rol"] == "ARRENDADOR"
        finally:
            _sess.AsyncSession = real
        with pytest.raises(HTTPException) as e:
            await sec.require_admin("Bearer mock-token-arrendador")
        assert e.value.status_code == 403
        assert (await sec.require_admin("Bearer mock-token-admin"))["rol"] == "ADMIN"
    con_db(main)


def test_verificar_sesion_resiliente_sin_pg(stores_limpios):
    async def main(db):
        from app.core import security as sec

        class _Mala:
            async def execute(self, *a, **k):
                raise RuntimeError("caída")

        # Dev sin PG: advierte y permite (resiliencia local).
        await sec._verificar_sesion_activa({"jti": "x"}, _Mala())
    con_db(main)


# ---------------------------------------------------------------------------
# auto_moderation directo
# ---------------------------------------------------------------------------
def test_automod_heuristica_y_aplicar(stores_limpios):
    async def main(db):
        from app.services import auto_moderation as am
        from app.models import Publicacion

        prov = am.HeuristicAIModerator()
        spam = await prov.evaluate_publication(
            {"titulo": "Casino x1000 viagra", "descripcion": "Descripción larga válida con más de veinte caracteres",
             "canon_mensual": 100}, ["https://a/1.jpg"])
        assert spam.decision == am.REJECT
        limpio = await prov.evaluate_publication(
            {"titulo": "Habitación amplia cerca al campus con buena luz",
             "descripcion": "Habitación amplia, iluminada y ventilada cerca al campus, con baño privado " * 5,
             "canon_mensual": 450000},
            ["https://a/1.jpg", "https://a/2.jpg", "https://a/3.jpg", "https://a/4.jpg"])
        assert limpio.decision == am.MANUAL_REVIEW and limpio.confidence_score >= 0.7
        raro = await prov.evaluate_publication(
            {"titulo": "Habitación amplia cerca al campus con buena luz",
             "descripcion": "Descripción larga válida con más de veinte caracteres",
             "canon_mensual": "no-numero"}, ["https://a/1.jpg", "https://a/2.jpg", "https://a/3.jpg"])
        assert raro.decision == am.MANUAL_REVIEW

        pub = await db.get(Publicacion, 1)
        antes = pub.estado
        res = await am.evaluar_y_aplicar(db, pub)
        assert res.decision == am.MANUAL_REVIEW
        assert pub.estado == antes  # flag OFF: no-op

        class _Aprueba:
            async def evaluate_publication(self, data, imagenes):
                return am.ModerationResult(decision=am.APPROVE, confidence_score=0.99,
                                           labels={}, motivos=[])
        res2 = await am.evaluar_y_aplicar(
            db, pub, proveedor=_Aprueba(),
            cfg={"moderacion_automatica": "true", "umbral_aprobacion_ia": "0.1"})
        assert res2.decision == am.APPROVE and pub.estado == "ACTIVO"
        await db.rollback()
    con_db(main)
