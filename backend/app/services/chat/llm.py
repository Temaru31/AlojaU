"""Capa LLM agnóstica de proveedor (solo chat; sin ejecución de código).

- `LLMProvider`: interfaz (completar; el chatbot de ayuda no usa tools).
- `FakeLLMProvider`: determinista, sin red. Se usa en tests y cuando no hay
  proveedor configurado: redacta con la documentación recibida.
- `HttpLLMProvider`: endpoint OpenAI-compatible `/chat/completions` por
  `urllib` stdlib (sin dependencias nuevas). La clave SOLO vive en env
  (`CHAT_LLM_API_KEY`, nunca en repo/logs/contexto) y la llamada corre con
  `asyncio.to_thread` + timeout desde el orquestador (no bloquea el loop).

Formato de turnos interno: {"rol": "system"|"user"|"assistant"|"tool",
"texto": str}. Respuesta del proveedor: {"texto": str, "tools": [
{"nombre": str, "argumentos": dict}]}. El chatbot de ayuda no ejecuta tools.
"""
import json
import time
import urllib.request


_USER_AGENT = "AlojaU-Chat/1.0 (+https://aloja-u.vercel.app)"


class LLMError(Exception):
    """Fallo del proveedor (red, timeout, respuesta inválida)."""


class LLMProvider:
    nombre = "base"

    async def completar(self, mensajes: list[dict],
                        herramientas: list[dict]) -> dict:
        raise NotImplementedError


# Fake determinista (tests + sin proveedor)

class FakeLLMProvider(LLMProvider):
    """Determinista y sin red: redacta con la documentación recibida.

    Toma el primer párrafo del mejor fragmento del bloque DATOS (así el
    asistente responde bien aun sin llave de proveedor). `guion` opcional
    para tests; `llamadas` cuenta usos.
    """

    nombre = "fake"

    def __init__(self, guion: list[dict] | None = None):
        self.guion = list(guion or [])
        self.llamadas = 0

    @staticmethod
    def _primer_parrafo(mensajes: list[dict]) -> str:
        for m in reversed(mensajes):
            if m.get("rol") != "tool":
                continue
            cuerpo = str(m.get("texto", "")).split("\n", 1)[-1]
            cuerpo = cuerpo.rsplit("</datos>", 1)[0]
            try:
                frags = json.loads(cuerpo).get("fragmentos") or []
            except ValueError:
                return ""
            if frags:
                return str(frags[0].get("fragmento", "")).split("\n\n")[0].strip()
        return ""

    async def completar(self, mensajes: list[dict],
                        herramientas: list[dict]) -> dict:
        self.llamadas += 1
        if self.guion:
            paso = self.guion.pop(0)
            return {"texto": str(paso.get("texto", "")),
                    "tools": list(paso.get("tools", []))}
        return {"texto": self._primer_parrafo(mensajes), "tools": []}


# Proveedor HTTP OpenAI-compatible (urllib, sin dependencias)

class HttpLLMProvider(LLMProvider):
    """POST {base_url}/chat/completions estilo OpenAI.

    La API key viaja SOLO en el header Authorization de esta llamada. Nunca
    entra al contexto del modelo ni a logs (ver orchestrator).
    """

    nombre = "http"

    def __init__(self, *, base_url: str, api_key: str, modelo: str,
                 timeout_s: float = 20.0, max_tokens: int = 600):
        self.base_url = (base_url or "").rstrip("/")
        self._api_key = api_key or ""
        self.modelo = modelo or ""
        self.timeout_s = max(5.0, min(float(timeout_s or 20.0), 60.0))
        self.max_tokens = max(64, min(int(max_tokens or 600), 2000))

    def _peticion(self, mensajes: list[dict],
                  herramientas: list[dict]) -> dict:
        cuerpo = {
            "model": self.modelo,
            # Los resultados de tools (rol interno "tool") viajan como
            # usuario: el modelo los recibe delimitados como DATOS.
            "messages": [
                {"role": ("system" if m.get("rol") == "system"
                          else "assistant" if m.get("rol") == "assistant"
                          else "user"),
                 "content": str(m.get("texto", ""))[:2000]}
                for m in mensajes if m.get("rol") in ("system", "user", "assistant", "tool")
            ],
            "temperature": 0.2,
            "max_tokens": self.max_tokens,
        }
        if herramientas:
            cuerpo["tools"] = herramientas
            cuerpo["tool_choice"] = "auto"
        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(cuerpo).encode("utf-8"),
            # Cloudflare (delante de Groq) bloquea el User-Agent por defecto de
            # urllib con 403 "error code: 1010" antes de llegar a la API.
            headers={"Content-Type": "application/json",
                     "User-Agent": _USER_AGENT,
                     "Authorization": f"Bearer {self._api_key}"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                datos = json.loads(resp.read().decode("utf-8") or "{}")
        except Exception as e:
            raise LLMError(f"proveedor no disponible: {type(e).__name__}")
        try:
            msg = (datos.get("choices") or [{}])[0].get("message") or {}
            tools = []
            for tc in msg.get("tool_calls") or []:
                fn = (tc.get("function") or {})
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                except Exception:
                    args = {}
                if isinstance(args, dict):
                    tools.append({"nombre": str(fn.get("name") or ""),
                                  "argumentos": args})
            return {"texto": str(msg.get("content") or ""), "tools": tools}
        except Exception:
            raise LLMError("respuesta del proveedor inválida")

    async def completar(self, mensajes: list[dict],
                        herramientas: list[dict]) -> dict:
        import asyncio as _aio
        t0 = time.monotonic()
        try:
            # to_thread: la E/S bloqueante no frena el event loop.
            return await _aio.wait_for(
                _aio.to_thread(self._peticion, mensajes, herramientas),
                timeout=self.timeout_s + 2.0)
        except LLMError:
            raise
        except Exception:
            raise LLMError("timeout del proveedor")
        finally:
            _ = time.monotonic() - t0
