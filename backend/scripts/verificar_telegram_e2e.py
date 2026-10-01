"""Verificación E2E del ciclo Telegram (local o prod).

Seguridad: este script NUNCA acepta secretos por CLI (quedarían en el
history del shell y visibles en `ps`). Todo secreto va por entorno o
prompt interactivo:
  ALOJAU_TEST_PASSWORD ... clave de la cuenta de prueba (o se pide con getpass)
  ALOJAU_WEBHOOK_SECRET . secret del webhook (solo si el backend lo exige)

Uso local:
  ALOJAU_TEST_PASSWORD=<TU_PASSWORD> python3 scripts/verificar_telegram_e2e.py \
    --base http://127.0.0.1:8000 \
    --email estudiante@alojau.com --chat-id 777888999

Uso prod (Render, solo lectura + webhook simulado con token propio):
  ALOJAU_TEST_PASSWORD=<TU_PASSWORD> ALOJAU_WEBHOOK_SECRET=<TU_SECRET> \
    python3 scripts/verificar_telegram_e2e.py \
    --base https://alojau-api.onrender.com \
    --email <TU_CORREO> --chat-id <TU_CHAT_ID> --esperar-canal telegram

El script (Opción A: /start + contacto verificado):
  1) login -> token
  2) POST /telegram/vincular-inicio -> bot_url (valida formato URL-safe <=64)
  3) POST /telegram/webhook con /start <token> -> debe pedir contacto
     (contacto_requerido, SIN vincular todavía)
  4) POST /telegram/webhook con contact {phone_number, user_id} igual al
     teléfono verificado -> vinculado True
  5) GET /perfil -> telegram_vinculado debe ser True
  6) POST /otp/solicitar -> muestra el canal (telegram solo si hay BOT_TOKEN)

  El --chat-id simula tu cuenta y --telefono debe ser tu número verificado
  en AlojaU (el de Mi Perfil). Para probar el rechazo, usa otro número.

NOTA: el paso 3 equivale exactamente al update que Telegram POSTea tras el
setWebhook. Si en prod el /start real no vincula, el problema está en el
registro del webhook (getWebhookInfo) o el secret, no en este código.
Ver docs/TELEGRAM_WEBHOOK.md para la guía de verificación en Telegram.
"""
import argparse
import getpass
import os
import re
import sys

import urllib.request
import urllib.error
import json

CHAT_RE = re.compile(r"^-?[0-9]{5,20}$")

# Nombres de variables de entorno (única vía para secretos en este script).
ENV_PASSWORD = "ALOJAU_TEST_PASSWORD"
ENV_WEBHOOK_SECRET = "ALOJAU_WEBHOOK_SECRET"

# Claves que JAMÁS se imprimen (tokens/códigos/secretos).
_CLAVES_SENSIBLES = ("token", "secret", "codigo", "code", "password", "passwd")


def _enmascarar(valor) -> str:
    """Enmascara PII (teléfonos): muestra solo los últimos 2 dígitos."""
    s = re.sub(r"\D", "", str(valor or ""))
    if len(s) <= 2:
        return "***"
    return "*" * (len(s) - 2) + s[-2:]


def _resumen(cuerpo) -> str:
    """Resumen seguro de una respuesta: claves + tipos, valores redactados.

    Evita filtrar access_token u otros secretos en consola/CI (CodeQL).
    """
    if not isinstance(cuerpo, dict):
        return f"<{type(cuerpo).__name__}>"
    partes = []
    for k in sorted(cuerpo.keys()):
        kl = str(k).lower()
        if any(s in kl for s in _CLAVES_SENSIBLES):
            partes.append(f"{k}=<redactado>")
        else:
            v = cuerpo[k]
            s = v if isinstance(v, (bool, int, float)) else str(v)
            s = str(s).replace("\r", " ").replace("\n", " ")
            partes.append(f"{k}={s[:60]}")
    return "{" + ", ".join(partes) + "}"


def llamada(base, metodo, ruta, token=None, cuerpo=None, headers=None):
    url = base.rstrip("/") + ruta
    data = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(url, data=data, method=metodo)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


def leer_password() -> str | None:
    """Clave solo desde entorno o prompt (nunca argv)."""
    pw = (os.getenv(ENV_PASSWORD) or "").strip()
    if pw:
        return pw
    try:
        pw = getpass.getpass("Password AlojaU (cuenta de prueba): ").strip()
        return pw or None
    except (EOFError, KeyboardInterrupt):
        print("\nCancelado: sin password no se puede verificar.")
        return None
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser(
        description="Verifica el ciclo de vinculación Telegram. "
                    f"Secretos solo vía {ENV_PASSWORD}/{ENV_WEBHOOK_SECRET} o prompt.")
    ap.add_argument("--base", required=True)
    ap.add_argument("--email", required=True)
    ap.add_argument("--chat-id", required=True)
    ap.add_argument("--telefono", default="",
                    help="Número a compartir como contacto (default: el verificado "
                         "no se conoce; úsalo para probar el camino feliz o el rechazo).")
    ap.add_argument("--esperar-canal", default="",
                    help="Si se indica (ej. telegram), el paso 6 debe dar ese canal.")
    args = ap.parse_args()

    if not CHAT_RE.match(str(args.chat_id)):
        print(f"chat-id inválido (5-20 dígitos, como el CHECK 017): {args.chat_id!r}")
        return 2
    password = leer_password()
    if not password:
        print("Sin credencial: no se puede verificar (falta variable de entorno).")
        return 2

    ok = True
    wh_headers = {}
    secreto = (os.getenv(ENV_WEBHOOK_SECRET) or "").strip()
    if secreto:
        wh_headers["X-Telegram-Bot-Api-Secret-Token"] = secreto

    s, login = llamada(args.base, "POST", "/api/auth/login",
                       cuerpo={"email": args.email, "password": password})
    token = login.get("access_token")
    print(f"[1] login: {s} {'OK' if token else 'FALLO'}")
    if not token:
        print("     ", _resumen(login))
        return 1

    s, ini = llamada(args.base, "POST", "/api/auth/telegram/vincular-inicio", token=token, cuerpo={})
    bot_url = ini.get("bot_url", "")
    tk = bot_url.split("start=")[1] if "start=" in bot_url else ""
    urlsafe = bool(re.fullmatch(r"[A-Za-z0-9_-]{1,64}", tk))
    print(f"[2] vincular-inicio: {s} token_len={len(tk)} urlsafe={urlsafe}")
    if s == 503:
        print("     Bot sin configurar (TELEGRAM_BOT_USERNAME). En prod debe ser 200.")
        return 1
    if not urlsafe:
        print("     Token no apto para deep-link de Telegram.")
        ok = False

    update = {"message": {"chat": {"id": int(args.chat_id), "type": "private"},
                          "from": {"id": int(args.chat_id)},
                          "text": f"/start {tk}"}}
    s, wh = llamada(args.base, "POST", "/api/auth/telegram/webhook",
                    cuerpo=update, headers=wh_headers)
    print(f"[3] webhook /start: {s} contacto_requerido={wh.get('contacto_requerido')}")
    if wh.get("contacto_requerido") is not True or wh.get("vinculado") is not False:
        print("     Se esperaba contacto_requerido=True sin vincular:", wh)
        ok = False

    if args.telefono:
        contacto = {"message": {"chat": {"id": int(args.chat_id), "type": "private"},
                                "from": {"id": int(args.chat_id)},
                                "contact": {"phone_number": args.telefono,
                                            "user_id": int(args.chat_id),
                                            "first_name": "Test"}}}
        s, wc = llamada(args.base, "POST", "/api/auth/telegram/webhook",
                        cuerpo=contacto, headers=wh_headers)
        print(f"[4] webhook contacto ({_enmascarar(args.telefono)}): {s} vinculado={wc.get('vinculado')}")
        if wc.get("vinculado") is not True:
            print("     ", _resumen(wc))
            ok = False
    else:
        print("[4] sin --telefono: se omite el paso de contacto "
              "(pásalo para probar el camino feliz o el rechazo).")

    s, perfil = llamada(args.base, "GET", "/api/auth/perfil", token=token)
    print(f"[5] perfil.telegram_vinculado: {perfil.get('telegram_vinculado')}")
    if args.telefono and perfil.get("telegram_vinculado") is not True:
        ok = False

    s, otp = llamada(args.base, "POST", "/api/auth/otp/solicitar", token=token,
                     cuerpo={"email": args.email, "proposito": "login"})
    print(f"[6] otp canal: {otp.get('canal')} (telegram = DM real; email = sin BOT_TOKEN o sin vínculo)")
    if args.esperar_canal and otp.get("canal") != args.esperar_canal:
        print(f"     Se esperaba canal {args.esperar_canal!r}: Telegram podría estar caído.")
        ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
