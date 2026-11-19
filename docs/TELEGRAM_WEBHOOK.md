# Telegram webhook — verificación en producción

> Estado: webhook implementado (`POST /api/auth/telegram/webhook`) y
> variables configuradas en Render. Esta guía verifica que Telegram
> realmente esté entregando los `/start`.
>
> Opción A (vigente): el `/start` ya NO vincula directo. Registra el chat
> como pendiente y pide el contacto (`request_contact`); solo vincula si el
> número coincide con el teléfono VERIFICADO del perfil.

## 1. ¿El webhook está registrado en Telegram?

```bash
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

Debe responder algo como:

```json
{"ok":true,"result":{
  "url":"https://alojau-api.onrender.com/api/auth/telegram/webhook",
  "has_custom_certificate":false,
  "pending_update_count":0,
  "last_error_message": null
}}
```

- `url` vacía → **no hay webhook**: registrar (paso 2).
- `last_error_message` con `401` → el `secret_token` no coincide con
  `TELEGRAM_WEBHOOK_SECRET` de Render: re-registrar con el secret correcto.
- `pending_update_count` creciendo → Render tarda/despertando; esperar.

## 2. (Re)registrar el webhook

```bash
curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://alojau-api.onrender.com/api/auth/telegram/webhook",
       "secret_token":"<MISMO VALOR QUE TELEGRAM_WEBHOOK_SECRET EN RENDER>",
       "allowed_updates":["message"]}'
```

Debe responder `{"ok":true,"result":true,"description":"Webhook was set"}`.
Cada cambio de `TELEGRAM_WEBHOOK_SECRET` exige re-registrar.

## 3. Prueba de punta a punta con cuenta real

1. En AlojaU → Mi Perfil → Datos: verifica tu número de teléfono (OTP).
   Sin teléfono verificado el bot rechaza (diseño aprobado, nunca ciego).
2. En la web (prod): Mi Perfil → Telegram → «Abrir Bot en Telegram».
3. En Telegram: pulsar `/start` y luego **📱 Compartir mi número**
   (debe ser el mismo número verificado).
4. Volver a la web y pulsar «Vincular cuenta» → badge «✓ Vinculado».
5. Pedir un código: debe llegar **al DM del bot**, no al correo.

Equivalente automatizado (simula los updates exactos de Telegram):

```bash
ALOJAU_TEST_PASSWORD=<TU_PASSWORD> python3 backend/scripts/verificar_telegram_e2e.py \
  --base https://alojau-api.onrender.com \
  --email <TU_CORREO> --chat-id <TU_CHAT_ID> --telefono +57<TU_NUMERO_VERIFICADO>
```

## 4. Si falla

| Síntoma | Causa probable |
|---|---|
| `vincular-inicio` da 503 | `TELEGRAM_BOT_USERNAME` vacío en Render |
| Siempre «no detectamos tu /start» | webhook no registrado o secret distinto (ver paso 1) |
| «verifica tu número» tras /start | normal (Opción A): verifica el teléfono en Mi Perfil y genera otro enlace |
| «número no coincide» | el Telegram usa otro número: verifica el correcto o cambia el de Mi Perfil |
| Vincula pero el código llega por correo | `TELEGRAM_BOT_TOKEN` vacío/erróneo en Render |
| Funciona en local pero no en prod | Render durmió el free tier a mitad del flujo: reintentar (el frontend ya reintenta 3 veces) |

## Notas de diseño (auditoría)

- `telegram_chat_id` es `VARCHAR(32)`: soporta IDs de 64 bits sin overflow.
- El token `?start=` es URL-safe (`[A-Za-z0-9_-]`, ≤64 chars); el backend
  aún acepta el formato legacy con puntos por compatibilidad.
- Solo DMs privados vinculan; grupos/canales se ignoran (privacidad M5).
- Tiempos en UTC en ambos extremos; expiración 5 min un solo uso.
