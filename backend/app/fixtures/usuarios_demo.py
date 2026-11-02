"""Usuarios demo en memoria (solo dev/test sin PG; mock_enabled()).

Claves demo ÚNICAS: AlojaU123 (igual que seed_db.py)."""
from app.core.dominio import Rol
from app.core.security import hash_password

MOCK_USERS = {
    "arrendador@alojau.com": {
        "password": hash_password("AlojaU123"),
        "rol": Rol.ARRENDADOR,
        "id": 1,
        "nombre_completo": "Arrendador Demo",
        "telefono_whatsapp": "573001234567",
        "telefono_verificado": False,
        "email_verificado": True,
    },
    "admin@alojau.com": {
        "password": hash_password("AlojaU123"),
        "rol": Rol.ADMIN,
        "id": 2,
        "nombre_completo": "Administrador AlojaU",
        "telefono_whatsapp": "573009998877",
        "telefono_verificado": True,
        "email_verificado": True,
    },
    "estudiante@alojau.com": {
        "password": hash_password("AlojaU123"),
        "rol": Rol.ESTUDIANTE,
        "id": 3,
        "nombre_completo": "Estudiante Demo",
        "telefono_whatsapp": "573001112233",
        "telefono_verificado": False,
        "email_verificado": False,
    },
}
