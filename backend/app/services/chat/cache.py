"""Caché en memoria de respuestas del LLM (sin E/S, con TTL y tope).

Solo se cachean respuestas de una pregunta suelta: la clave combina la
pregunta normalizada, los documentos usados y el proveedor/modelo. Las
respuestas fijas de intención y las de inyección/datos sensibles nunca pasan
por aquí.
"""
import hashlib
import time
from collections import OrderedDict


class CacheRespuestas:
    """LRU acotada con vencimiento por tiempo.

    `reloj` es inyectable para probar el TTL sin esperas reales.
    """

    def __init__(self, max_entradas: int = 256, ttl_s: float = 900.0,
                 reloj=time.monotonic):
        self.max_entradas = max(1, int(max_entradas))
        self.ttl_s = max(0.0, float(ttl_s))
        self._reloj = reloj
        self._datos: OrderedDict[str, tuple[float, str]] = OrderedDict()

    def obtener(self, clave: str) -> str | None:
        """Valor vigente o None; descarta la entrada vencida."""
        entrada = self._datos.get(clave)
        if entrada is None:
            return None
        creado, valor = entrada
        if self._reloj() - creado > self.ttl_s:
            self._datos.pop(clave, None)
            return None
        self._datos.move_to_end(clave)
        return valor

    def guardar(self, clave: str, valor: str) -> None:
        """Guarda/renueva y expulsa la entrada más antigua si pasa el tope."""
        self._datos[clave] = (self._reloj(), str(valor))
        self._datos.move_to_end(clave)
        while len(self._datos) > self.max_entradas:
            self._datos.popitem(last=False)

    def limpiar(self) -> None:
        self._datos.clear()

    def __len__(self) -> int:
        return len(self._datos)


def clave_cache(pregunta: str, documentos: list[str], modelo: str) -> str:
    """Clave sha256 estable: pregunta + documentos usados + proveedor/modelo."""
    material = "\x1f".join([
        str(pregunta or ""),
        "|".join(str(d) for d in documentos or []),
        str(modelo or ""),
    ])
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


CACHE_RESPUESTAS = CacheRespuestas()


def clear_cache_respuestas_for_tests() -> None:
    CACHE_RESPUESTAS.limpiar()
