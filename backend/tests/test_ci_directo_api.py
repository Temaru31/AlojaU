"""Endpoints invocados directo en hilo principal (misma BD, mismo código).

Complementa los tests HTTP (conducta vía stack real): aquí se mide lo que
el portal de TestClient ejecuta en otro hilo. Sin mocks de lógica propia;
datos reales (seed + filas temporales que el reseed limpia).
"""
import asyncio
import uuid
from datetime import datetime, timezone
from io import BytesIO

import pytest
from fastapi import HTTPException
from starlette.datastructures import Headers
from starlette.requests import Request
from starlette.responses import Response
from starlette.datastructures import UploadFile

_N = [0]


def ip_unica():
    _N[0] += 1
    return f"10.9.{(_N[0] // 250) + 1}.{(_N[0] % 250) + 1}"


def req(method="POST", ip=None, host="test"):
    ip = ip or ip_unica()
    return Request({
        "type": "http", "method": method, "path": "/",
        "headers": [(b"host", host.encode()), (b"x-forwarded-for", ip.encode())],
        "client": (ip, 5000), "server": ("test", 80), "scheme": "http",
    })


def con_db(fn):
    async def main():
        from app.db.session import AsyncSession
        async with AsyncSession() as db:
            return await fn(db)
    return asyncio.run(main())


@pytest.fixture()
def stores_limpios():
    from app.routers import auth as _a
    from app.routers import reportes as _r
    from app.routers import admin_automation as _auto
    from app.routers import campus as _campus
    from app.routers import ciudades as _ciudades
    from app.routers import zonas as _zonas
    from app.routers import publicaciones as _p
    from app.core import security as _s
    _a._LOGIN_ATTEMPTS.clear()
    _a._PW_ATTEMPTS.clear()
    _a._OTP_SOLICITAR.clear()
    _a._OTP_VERIFICAR.clear()
    _r._REPORT_ATTEMPTS.clear()
    _p._VISTAS_MEM.clear()
    _s.clear_rol_cache_for_tests()
    for mod, fn in ((_auto, "clear_settings_cache"), (_campus, "clear_campus_cache"),
                    (_ciudades, "clear_ciudades_cache"), (_zonas, "clear_zonas_cache")):
        try:
            getattr(mod, fn)()
        except Exception:
            pass
    yield
    _a._LOGIN_ATTEMPTS.clear()
    _r._REPORT_ATTEMPTS.clear()
    _s.clear_rol_cache_for_tests()


def _alta_usuario(db, email, rol="ARRENDADOR", verificado=True):
    from app.models import Usuario
    from app.core.security import hash_password
    u = Usuario(nombre_completo="Directo API", email=email,
                password_hash=hash_password("Directo1!x"), rol=rol,
                telefono_whatsapp="573001234567", telefono_verificado=True,
                email_verificado=verificado)
    db.add(u)
    return u


async def _usuario_token(db, tag, rol="ARRENDADOR"):
    from app.routers import auth as router
    from app.routers.auth import RegisterIn, LoginIn
    email = f"directo_{tag}_{uuid.uuid4().hex[:6]}@alojau.com"
    await router.register(RegisterIn(
        email=email, password="Directo1!x", nombre_completo="Directo API",
        telefono_whatsapp="573001234567", acepto_tratamiento_datos=True),
        req(ip=ip_unica()), db)
    from app.models import Usuario
    from sqlalchemy import select
    u = (await db.execute(select(Usuario).where(Usuario.email == email))).scalars().one()
    u.email_verificado = True
    if rol != "ESTUDIANTE":
        u.rol = rol
    await db.commit()
    login = await router.login(LoginIn(email=email, password="Directo1!x"),
                               req(ip=ip_unica()), db)
    return email, u.id, login["access_token"]


def _h(uid, rol="ARRENDADOR"):
    return {"id": uid, "rol": rol, "sub": "x", "email_verificado": True,
            "telefono_whatsapp": "573001234567"}


async def _usuario_token(db, tag, rol="ARRENDADOR"):
    from app.routers import auth as router
    from app.routers.auth import RegisterIn, LoginIn
    email = f"directo_{tag}_{uuid.uuid4().hex[:6]}@alojau.com"
    await router.register(RegisterIn(
        email=email, password="Directo1!x", nombre_completo="Directo API",
        telefono_whatsapp="573001234567", acepto_tratamiento_datos=True),
        req(ip=ip_unica()), db)
    from app.models import Usuario
    from sqlalchemy import select
    u = (await db.execute(select(Usuario).where(Usuario.email == email))).scalars().one()
    u.email_verificado = True
    if rol != "ESTUDIANTE":
        u.rol = rol
    await db.commit()
    login = await router.login(LoginIn(email=email, password="Directo1!x"),
                               req(ip=ip_unica()), db)
    return email, u.id, login["access_token"]


# ---------------------------------------------------------------------------
# publicaciones
# ---------------------------------------------------------------------------
def test_api_list_mias_detail_flujos(stores_limpios):
    async def main(db):
        from app.routers import publicaciones as r

        pagina = await r.list_publicaciones(
            None, None, None, None, None, None, None, None, 1, 9, db)
        assert pagina["total"] >= 6 and len(pagina["items"]) >= 1
        filt = await r.list_publicaciones(
            1, 400000, 500000, "HABITACION_INDEPENDIENTE", "1", None,
            None, None, 1, 9, db)
        assert filt["total"] >= 0
        with pytest.raises(HTTPException) as e:
            await r.list_publicaciones(
                None, 900000, 100000, None, None, None, None, None, 1, 9, db)
        assert e.value.status_code == 400
        mias = await r.mis_publicaciones(None, 1, 12, "recientes", db, _h(1))
        assert mias["total"] >= 6
        with pytest.raises(HTTPException):
            await r.mis_publicaciones(None, 1, 12, "recientes", db, {"rol": "x"})
        det = await r.get_publicacion(1, None, db, None)
        assert det["id"] == 1 and det["fotos"]
        with pytest.raises(HTTPException) as e404:
            await r.get_publicacion(999999, None, db, None)
        assert e404.value.status_code == 404
        ref = await r.get_publicacion(1, 1, db, None)
        assert ref["campus_ref"] is not None and ref["campus_ref"]["campus_id"] == 1
        with pytest.raises(HTTPException):
            await r.get_publicacion(1, 999999, db, None)
    con_db(main)


def test_api_crear_editar_fotos(stores_limpios):
    async def main(db):
        from app.routers import publicaciones as r
        from app.schemas.publicacion import PublicacionCreate, PublicacionUpdate
        from app.routers.publicaciones import FotosSetIn

        email, uid, _tok = await _usuario_token(db, "ce")
        creado = await r.crear_publicacion(PublicacionCreate(
            titulo="Directa amplia con título largo", descripcion="Descripción directa amplia con más de veinte caracteres",
            tipo_inmueble="APARTAESTUDIO", canon_mensual=500000, deposito_requerido=0,
            zona_barrio_id=1, direccion_referencial="Calle directa 123",
            reglas_convivencia="Reglas directas válidas", servicios_ids=[1, 2],
            campus_ids=[1], fotos=["https://a.com/1.jpg", "https://a.com/2.jpg", "https://a.com/3.jpg"],
        ), _h(uid), db)
        pid = creado["id"]
        assert creado["estado"] == "PENDIENTE"
        authz = f"Bearer {_tok}"
        det = await r.get_publicacion(pid, None, db, authz)
        assert det["id"] == pid
        edit = await r.editar_publicacion(
            pid, PublicacionUpdate(titulo="Directa editada con título largo",
                                   servicios_ids=[1],
                                   fotos=[det["fotos"][2], det["fotos"][0], det["fotos"][1]]),
            db, _h(uid))
        assert edit["titulo"].startswith("Directa editada")
        det2 = await r.get_publicacion(pid, None, db, authz)
        assert det2["fotos"][0] == det["fotos"][2]
        fotos = await r.reemplazar_fotos(
            pid, FotosSetIn(fotos=["https://n.com/1.jpg", "https://n.com/2.jpg"]), db, _h(uid))
        assert fotos["total"] == 2
        with pytest.raises(HTTPException) as e403:
            await r.editar_publicacion(pid, PublicacionUpdate(titulo="Directa editada por ajeno x"),
                                       db, {"id": 999998, "rol": "ARRENDADOR"})
        assert e403.value.status_code == 403
    con_db(main)


def test_api_renovar_eliminar_estado_vista_similares(stores_limpios):
    async def main(db):
        from app.routers import publicaciones as r
        from app.models import Publicacion

        email, uid, _tok = await _usuario_token(db, "rev")
        pub = Publicacion(usuario_id=uid, zona_barrio_id=1, titulo="Directa ciclo de vida amplio",
                          descripcion="Descripción directa con más de veinte caracteres",
                          tipo_inmueble="HABITACION_INDEPENDIENTE", canon_mensual=400000,
                          reglas_convivencia="Reglas directas",
                          direccion_referencial="Calle ciclo 123", estado="ACTIVO")
        db.add(pub)
        await db.commit()
        pid = pub.id
        ren = await r.renovar_publicacion(pid, db, _h(uid))
        assert ren["dias_agregados"] == 30
        with pytest.raises(HTTPException):
            await r.renovar_publicacion(pid, db, _h(999997))
        est = await r.cambiar_estado_dueno(pid, {"estado": "PAUSADO"}, db, _h(uid))
        assert est["estado"] == "PAUSADO"
        with pytest.raises(HTTPException) as e422:
            await r.cambiar_estado_dueno(pid, {"estado": "XPTO"}, db, _h(uid))
        assert e422.value.status_code == 422
        vis = await r.registrar_vista(pid, req(ip=ip_unica()), db)
        assert vis["contada"] is True
        vis2 = await r.registrar_vista(pid, req(ip=ip_unica()), db)
        assert vis2["contada"] is True
        sim = await r.similares(1, 4, db)
        assert sim["total"] >= 0
        with pytest.raises(HTTPException):
            await r.similares(999999, 4, db)
        hist = await r.historial_aviso(pid, db, _h(uid))
        assert hist["id"] == pid
        with pytest.raises(HTTPException):
            await r.historial_aviso(pid, db, _h(999996))
        out = await r.eliminar_publicacion(pid, db, _h(uid))
        assert out["eliminada"] is True
        with pytest.raises(HTTPException):
            await r.eliminar_publicacion(999999, db, _h(uid))
    con_db(main)


def _archivo(nombre="a.jpg", contenido=b"\xff\xd8\xff" + b"\x00" * 100, mime="image/jpeg"):
    from starlette.datastructures import Headers
    return UploadFile(file=BytesIO(contenido), filename=nombre,
                      headers=Headers({"content-type": mime}))


def test_api_uploads_directos(stores_limpios):
    async def main(db):
        from app.routers import uploads as u
        from app.routers.uploads import OrdenIn, VincularIn

        user = _h(1)
        r = await u.upload_fotos(req(), [_archivo(f"f{i}.jpg") for i in range(3)], user)
        assert r["count"] == 3 and len(r["urls"]) == 3
        una = await u.upload_una_foto(req(), _archivo(), user)
        assert una["count"] == 1
        vinc = await u.vincular_fotos(VincularIn(publicacion_id=1, urls=una["urls"]), db, user)
        assert vinc["total"] >= 4
        det_ids = vinc["ids"]
        from app.models import ImagenPublicacion
        from sqlalchemy import select
        ajena = (await db.execute(
            select(ImagenPublicacion.id).where(ImagenPublicacion.publicacion_id == 1)
            .order_by(ImagenPublicacion.id.asc()).limit(1))).scalars().first()
        elim = await u.eliminar_foto(det_ids[0], db, user)
        assert elim["eliminada"] is True
        with pytest.raises(HTTPException) as e404:
            await u.eliminar_foto(999999999, db, user)
        assert e404.value.status_code == 404
        with pytest.raises(HTTPException) as e403:
            await u.eliminar_foto(ajena, db, _h(999995))
        assert e403.value.status_code == 403
        # Reordenar directo: portada = última vinculada restante.
        restantes = (await db.execute(
            select(ImagenPublicacion.id).where(ImagenPublicacion.publicacion_id == 1)
            .order_by(ImagenPublicacion.orden.asc()))).scalars().all()
        ro = await u.reordenar_fotos(
            OrdenIn(publicacion_id=1, orden_ids=restantes[::-1]), db, user)
        assert ro["portada_id"] == restantes[-1]
    con_db(main)


# ---------------------------------------------------------------------------
# admin + automation + reportes + catálogos
# ---------------------------------------------------------------------------
def test_api_admin_directo(stores_limpios):
    async def main(db):
        from app.routers import admin as a
        from app.routers.admin import CambioEstadoIn
        from app.models import Publicacion

        admin = {"id": 2, "rol": "ADMIN"}
        m = await a.metricas(db, admin)
        assert m.total_publicaciones >= 6
        pen = await a.pendientes(1, 12, db, admin)
        assert pen["total"] >= 0
        pub = Publicacion(usuario_id=2, zona_barrio_id=1, titulo="Directa admin con título largo",
                          descripcion="Descripción directa con más de veinte caracteres",
                          tipo_inmueble="COMPARTIDO", canon_mensual=300000,
                          reglas_convivencia="Reglas directas",
                          direccion_referencial="Calle admin 123", estado="PENDIENTE")
        db.add(pub)
        await db.commit()
        ok = await a.cambiar_estado(pub.id, CambioEstadoIn(estado="ACTIVO"), db, admin)
        assert ok["estado"] == "ACTIVO"
        b = await a._bulk_cambiar_estado(db, admin, [pub.id, 999999], "PAUSADO", "PAUSED")
        assert pub.id in b["cambiados"] and 999999 in b["no_encontrados"]
        assert isinstance(b.get("democionados"), list)
        aud = await a.ver_auditoria(None, None, 1, 20, db, admin)
        assert aud["total"] >= 1
        await a.eliminar(pub.id, db, admin)
        with pytest.raises(HTTPException):
            await a.cambiar_estado(999999, CambioEstadoIn(estado="ACTIVO"), db, admin)
    con_db(main)


def test_api_automation_reportes_catalogos(stores_limpios):
    async def main(db):
        from app.routers import admin_automation as am
        from app.routers.admin_automation import SettingPatch
        from app.routers import reportes as rep
        from app.routers.reportes import ReporteIn, ReporteAccionIn
        from app.routers import campus as cp, ciudades as ci, zonas as zn
        from starlette.responses import Response

        admin = {"id": 2, "rol": "ADMIN"}
        todo = await am.listar_settings(db, admin)
        assert any(s.clave == "dias_vigencia_publicacion" for s in todo)
        orig = [s for s in todo if s.clave == "dias_vigencia_publicacion"][0].valor
        ok = await am.editar_setting("dias_vigencia_publicacion", SettingPatch(valor="31"), db, admin)
        assert ok.valor == "31"
        await am.editar_setting("dias_vigencia_publicacion", SettingPatch(valor=orig), db, admin)
        with pytest.raises(HTTPException):
            await am.editar_setting("clave_inexistente", SettingPatch(valor="1"), db, admin)
        ev = await am.evaluar_pub(1, db, admin)
        assert ev["evaluado"] is True
        with pytest.raises(HTTPException):
            await am.evaluar_pub(999999, db, admin)

        creado = await rep.crear_reporte(
            ReporteIn(publicacion_id=1, motivo="OTRO", detalle="Detalle directo largo"), req(ip=ip_unica()), db, None)
        assert creado["estado"] == "PENDIENTE"
        lista = await rep.listar_reportes(None, db, admin)
        assert any(r["id"] == creado["id"] for r in lista)
        conf = await rep.revisar_reporte(creado["id"], ReporteAccionIn(accion="confirmar"), db, admin)
        assert conf["estado"] == "CONFIRMADO"
        with pytest.raises(HTTPException) as e409:
            await rep.revisar_reporte(creado["id"], ReporteAccionIn(accion="descartar"), db, admin)
        assert e409.value.status_code == 409

        assert len(await cp.list_campus(Response(), db)) >= 1
        assert len(await ci.list_ciudades(Response(), db)) >= 1
        assert len(await zn.list_zonas(Response(), db)) == 6
    con_db(main)


# ---------------------------------------------------------------------------
# auth directo (flujos completos con datos reales)
# ---------------------------------------------------------------------------
def test_api_auth_registro_login_perfil(stores_limpios):
    async def main(db):
        from app.routers import auth as a
        from app.routers.auth import (RegisterIn, LoginIn, PerfilUpdateIn, PasswordChangeIn)

        email = f"directo_auth_{uuid.uuid4().hex[:6]}@alojau.com"
        reg = await a.register(RegisterIn(
            email=email, password="Directo1!x", nombre_completo="Directo Auth",
            telefono_whatsapp="573001234567", acepto_tratamiento_datos=True),
            req(ip=ip_unica()), db)
        assert reg["rol"] == "ESTUDIANTE"
        with pytest.raises(HTTPException):
            await a.register(RegisterIn(
                email=email, password="Directo1!x", nombre_completo="Directo Auth",
                acepto_tratamiento_datos=False), req(ip=ip_unica()), db)
        login = await a.login(LoginIn(email=email, password="Directo1!x"), req(ip=ip_unica()), db)
        assert login["rol"] == "ESTUDIANTE"
        with pytest.raises(HTTPException):
            await a.login(LoginIn(email=email, password="Mala1234!x"), req(ip=ip_unica()), db)
        from app.models import Usuario
        from sqlalchemy import select
        u = (await db.execute(select(Usuario).where(Usuario.email == email))).scalars().one()
        u.email_verificado = True
        await db.commit()
        me = await a.get_perfil({"id": u.id, "sub": email}, db)
        assert me.email == email
        upd = await a.update_perfil(PerfilUpdateIn(nombre_completo="Directo Renombrado"), {"id": u.id, "sub": email}, db)
        assert upd.nombre_completo == "Directo Renombrado"
        pw = await a.cambiar_password(PasswordChangeIn(actual="Directo1!x", nueva="Directo2!x"),
                                      {"id": u.id, "sub": email}, db)
        assert "éxito" in pw["mensaje"]
        with pytest.raises(HTTPException):
            await a.cambiar_password(PasswordChangeIn(actual="Directo1!x", nueva="Directo2!x"),
                                     {"id": u.id, "sub": email}, db)
        sol = await a.solicitar_verificacion({"id": u.id, "sub": email}, db)
        assert sol["estado"] == "PENDIENTE"
    con_db(main)


def test_api_auth_otp_recovery_oauth(stores_limpios):
    async def main(db):
        from app.routers import auth as a
        from app.routers.auth import (OtpSolicitarIn, OtpVerificarIn, RecoverySolicitarIn,
                                      RecoveryConfirmarIn, GoogleCallbackIn)

        email = f"directo_otp_{uuid.uuid4().hex[:6]}@alojau.com"
        s = await a.otp_solicitar(OtpSolicitarIn(email=email, proposito="email_verify"), db)
        assert s["expira_minutos"] == 10 and s["canal"] in ("email", "telegram")
        codigo, _canal = await a._crear_otp(db, email, "login")
        ok = await a.otp_verificar(OtpVerificarIn(email=email, codigo=codigo, proposito="login"), db)
        assert ok["email_verificado"] is True
        with pytest.raises(HTTPException):
            await a.otp_verificar(OtpVerificarIn(email=email, codigo="000000", proposito="login"), db)
        rec = await a.recovery_solicitar(RecoverySolicitarIn(email=email), req(ip=ip_unica()), db)
        assert "mensaje" in rec
        with pytest.raises(HTTPException):
            await a.recovery_confirmar(RecoveryConfirmarIn(
                email=email, token="x" * 32, nueva_password="Directo3!x"), db)
        gemail = f"directo_goo_{uuid.uuid4().hex[:6]}@alojau.com"
        goo = await a.oauth_google_callback(GoogleCallbackIn(
            email=gemail, nombre_completo="Goo Directo"), req(ip=ip_unica()), db)
        assert goo["es_nuevo"] is True
        goo2 = await a.oauth_google_callback(GoogleCallbackIn(
            email=gemail, nombre_completo="Goo Directo"), req(ip=ip_unica()), db)
        assert goo2["es_nuevo"] is False
    con_db(main)


def test_api_auth_sesiones_cuenta_logout(stores_limpios):
    async def main(db):
        import jwt as _jwt
        from app.core.config import settings as _s
        from app.routers import auth as a
        from app.routers.auth import CuentaEliminarIn, CuentaRestaurarIn

        email = f"directo_ses_{uuid.uuid4().hex[:6]}@alojau.com"
        from app.routers.auth import RegisterIn, LoginIn
        await a.register(RegisterIn(
            email=email, password="Directo1!x", nombre_completo="Directo Ses",
            telefono_whatsapp="573001234567", acepto_tratamiento_datos=True),
            req(ip=ip_unica()), db)
        from app.models import Usuario
        from sqlalchemy import select
        u = (await db.execute(select(Usuario).where(Usuario.email == email))).scalars().one()
        u.email_verificado = True
        await db.commit()
        login = await a.login(LoginIn(email=email, password="Directo1!x"), req(ip=ip_unica()), db)
        claims = _jwt.decode(login["access_token"], options={"verify_signature": False})
        user = {"id": u.id, "sub": email, "jti": claims["jti"]}
        ses = await a.listar_sesiones(user, db)
        assert len(ses) >= 1 and any(s.actual for s in ses)
        out = await a.logout_actual(db, f"Bearer {login['access_token']}")
        assert out["revocadas"] >= 1
        out2 = await a.logout_todas(db, f"Bearer {login['access_token']}")
        assert out2["revocadas"] >= 0
        pro = await a.promoverme({"id": u.id, "sub": email}, db)
        assert pro["rol"] == "ARRENDADOR"
        elim = await a.eliminar_cuenta(CuentaEliminarIn(confirm_email=email, password="Directo1!x"),
                                       {"id": u.id, "sub": email}, db)
        assert elim["gracia_dias"] == 30
        rest = await a.restaurar_cuenta(CuentaRestaurarIn(email=email, password="Directo1!x"),
                                        req(ip=ip_unica()), db)
        assert rest["rol"] == "ARRENDADOR"
    con_db(main)
