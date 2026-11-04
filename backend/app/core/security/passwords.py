"""Hash y verificación de contraseñas con bcrypt (sin passlib)."""
import bcrypt as _bcrypt


# Passlib está abandonado (último release 2020) y rompía con
# bcrypt 4.1+ (ValueError 72 bytes). Se usa bcrypt directo (ya pineado a
# 4.0.1): mismos hashes $2b$ verificables con los seeds existentes.
def _pw_bytes(p) -> bytes:
    return str(p or "").encode("utf-8")[:72]


def hash_password(p) -> str:
    return _bcrypt.hashpw(_pw_bytes(p), _bcrypt.gensalt()).decode("utf-8")


def verify_password(p, h) -> bool:
    try:
        return _bcrypt.checkpw(_pw_bytes(p), str(h or "").encode("utf-8"))
    except Exception:
        return False
