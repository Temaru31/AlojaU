"""Claims del JWT verificado y el id del propietario (401 si falta)."""
from typing import Mapping, TypedDict
from fastapi import HTTPException


class ClaimsUsuario(TypedDict, total=False):
    """Claims del JWT verificado que reciben los endpoints autenticados."""
    sub: str  # email
    id: int
    rol: str
    scopes: list[str]
    jti: str
    exp: int
    telefono_whatsapp: str
    telefono_verificado: bool
    email_verificado: bool


def id_propietario(user: Mapping) -> int:
    """Id entero del token; 401 si falta (nunca operar sobre un dueño ajeno)."""
    uid = user.get("id")
    if not isinstance(uid, int):
        raise HTTPException(status_code=401, detail="Token sin propietario válido")
    return uid
