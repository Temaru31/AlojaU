"""Contraseñas: hash/verificación bcrypt fuera del event loop y política de fortaleza."""
import asyncio
import re
from typing import Optional

from app.core.security import hash_password, verify_password


async def hash_password_async(pw: str) -> str:
    """bcrypt fuera del event loop (CPU-bound ~100-300ms por hash).

    Sin esto, cada login/registro bloquea el loop asyncio y serializa
    todos los requests concurrentes del worker (autosaturación).
    """
    return await asyncio.to_thread(hash_password, pw)


async def verify_password_async(pw: str, h: str) -> bool:
    """Verificación bcrypt fuera del event loop (ver hash_password_async)."""
    return await asyncio.to_thread(verify_password, pw, h)


def motivo_password_debil(pw: str) -> Optional[str]:
    """Motivo por el que `pw` es débil, o None si es fuerte (8+ con mayús, número y especial)."""
    if len(pw) < 8:
        return "Mínimo 8 caracteres"
    if not re.search(r"[A-Z]", pw):
        return "Debe incluir al menos una mayúscula"
    if not re.search(r"[0-9]", pw):
        return "Debe incluir al menos un número"
    if not re.search(r"[^A-Za-z0-9]", pw):
        return "Debe incluir al menos un carácter especial"
    return None
