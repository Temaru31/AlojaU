"""Verificación E2E del ciclo Telegram (local o prod).

Uso local:
  python3 scripts/verificar_telegram_e2e.py \
    --base http://127.0.0.1:8000 \
    --email estudiante@alojau.com --password AlojaU123 \
    --chat-id 777888999

Uso prod (Render, solo lectura + webhook simulado con token propio):
  python3 scripts/verificar_telegram_e2e.py \
    --base https://alojau-api.onrender.com \
    --email tu@correo.com --password '...' --chat-id 123456

El script:
  1) login -> token
  2) POST /telegram/vincular-inicio -> bot_url (valida formato URL-safe <=64)
  3) POST /telegram/webhook con /start <token> (simula lo que Telegram envía)
  4) GET /perfil -> telegram_vinculado debe ser True
  5) POST /otp/solicitar -> muestra el canal (telegram solo si hay BOT_TOKEN)

NOTA: el paso 3 equivale exactamente al update que Telegram POSTea tras el
setWebhook. Si en prod el /start real no vincula, el problema está en el
registro del webhook (getWebhookInfo) o el secret, no en este código.
Ver docs/TELEGRAM_WEBHOOK.md para la guía de verificación en Telegram.
"""
import argparse
import os
import re
import sys

import urllib.request
import urllib.error
import json

CHAT_RE = re.compile(r"^-?[0-9]{5,20}$")


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--email", required=True)
    # Por seguridad la clave NO va en CLI (queda en history/ps): env o prompt.
    ap.add_argument("--password", default=None,
                    help="O usa ALOJAU_PASSWORD (recomendado).")
    ap.add_argument("--chat-id", required=True)
    ap.add_argument("--webhook-secret", default=None,
                    help="Si el webhook lo exige, se envía como header.")
    ap.add_argument("--esperar-canal", default="",
                    help="Si se indica (ej. telegram), el paso 5 debe dar ese canal.")
    args = ap.parse_args()

    if not CHAT_RE.match(str(args.chat_id)):
        print(f"chat-id inválido (5-20 dígitos, como el CHECK 017): {args.chat_id!r}")
        return 2
    password = args.password or os.getenv("ALOJAU_PASSWORD")
    if not password:
        try:
            import getpass
            password = getpass.getpass("Password AlojaU: ")
        except Exception:
            print("Sin password (usa --password o ALOJAU_PASSWORD).")
            return 2

    ok = True
    wh_headers = {}
    if args.webhook_secret:
        wh_headers["X-Telegram-Bot-Api-Secret-Token"] = args.webhook_secret

    s, login = llamada(args.base, "POST", "/api/auth/login",
                       cuerpo={"email": args.email, "password": password})
    token = login.get("access_token")
    print(f"[1] login: {s} {'OK' if token else 'FALLO'}")
    if not token:
        print("     ", login)
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
                          "text": f"/start {tk}"}}
    s, wh = llamada(args.base, "POST", "/api/auth/telegram/webhook",
                    cuerpo=update, headers=wh_headers)
    print(f"[3] webhook /start: {s} vinculado={wh.get('vinculado')}")
    if wh.get("vinculado") is not True:
        print("     ", wh)
        ok = False

    s, perfil = llamada(args.base, "GET", "/api/auth/perfil", token=token)
    print(f"[4] perfil.telegram_vinculado: {perfil.get('telegram_vinculado')}")
    if perfil.get("telegram_vinculado") is not True:
        ok = False

    s, otp = llamada(args.base, "POST", "/api/auth/otp/solicitar", token=token,
                     cuerpo={"email": args.email, "proposito": "login"})
    print(f"[5] otp canal: {otp.get('canal')} (telegram = DM real; email = sin BOT_TOKEN o sin vínculo)")
    if args.esperar_canal and otp.get("canal") != args.esperar_canal:
        print(f"     Se esperaba canal {args.esperar_canal!r}: Telegram podría estar caído.")
        ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
