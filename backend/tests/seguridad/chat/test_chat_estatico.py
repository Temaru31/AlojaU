"""Test estático: el módulo del chatbot es de SOLO LECTURA por construcción.

Recorre con `ast` todos los .py de `app/services/chat/` (y `routers/chat.py`
si existe) y falla si aparece CUALQUIERA de:
- imports de repositorios, de la sesión principal o de servicios de escritura;
- `text()` / `execute()` con strings SQL / f-strings con SQL;
- DML (`insert/update/delete`), `session.add/commit/flush/delete/merge`;
- ejecución de código o sistema (`eval/exec/compile/subprocess/os.system/
  __import__/pickle`), acceso a env (`os.environ/getenv`) o a red/archivos
  fuera de lectura local estricta (`urllib`/`http` salvo Fase 2 con allowlist).

No necesita PG: corre siempre (también en modo mock).
"""
import ast
import pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent.parent.parent  # backend/
CHAT_DIR = REPO / "app" / "services" / "chat"
ROUTER_CHAT = REPO / "app" / "routers" / "chat.py"

# Prefijos de módulo prohibidos en el código del chatbot.
IMPORTS_PROHIBIDOS = (
    "app.repositories",
    "app.db.session",
    "app.routers",
    "app.models",
    "app.services.auto_moderation",
    "app.services.notifications",
    "app.services.notifications_matcher",
    "app.services.telegram",
    "app.services.storage",
    "app.services.role_lifecycle",
    "app.services.housing_types",
    "app.services.ciudades",
    "app.services.media_moderation",
    "os",
    "subprocess",
    "importlib",
    "pickle",
    "yaml",
    "socket",
)

# Red: solo llm.py puede importar urllib/http (egreso al proveedor LLM con
# URL fija de settings; el contenido del usuario va en el body, nunca en URL).
RED_PERMITIDA_SOLO_EN = {"llm.py": ("urllib", "http")}

# Nombres importados sueltos prohibidos (from x import ...).
NOMBRES_PROHIBIDOS = {
    "text", "insert", "update", "delete", "get_session", "AsyncSession",
    "engine", "eval", "exec", "compile", "__import__",
}

# Llamadas por atributo prohibidas: obj.<nombre>(...). `add` solo cuenta en
# receptores con pinta de sesión (set.add/dict son benignos y se usan).
ATRIBUTOS_PROHIBIDOS = {
    "commit", "flush", "delete", "merge",
    "execute_raw", "executescript", "system", "popen",
}
RECEPTORES_SESION = {"db", "session", "sesion", "sess", "s"}

# Palabras SQL que delatan SQL crudo dentro de un f-string.
SQL_EN_FSTRING = (
    "SELECT", "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE",
    "TRUNCATE", "GRANT", "REVOKE",
)

# Funciones builtin peligrosas usadas como nombre directo.
BUILTINS_PROHIBIDOS = {"eval", "exec", "compile", "__import__"}


def _archivos_chat() -> list[pathlib.Path]:
    archivos = sorted(CHAT_DIR.rglob("*.py")) if CHAT_DIR.is_dir() else []
    if ROUTER_CHAT.is_file():
        archivos.append(ROUTER_CHAT)
    assert archivos, "services/chat/ vacío: nada que auditar"
    return archivos


def _red_permitida(path: pathlib.Path, nombre: str) -> bool:
    permitidos = RED_PERMITIDA_SOLO_EN.get(path.name, ())
    return any(nombre == p or nombre.startswith(p + ".") for p in permitidos)


def _modulo_de(node: ast.ImportFrom) -> str:
    return node.module or ""


def auditar_archivo(path: pathlib.Path) -> list[str]:
    """Devuelve la lista de violaciones encontradas (vacía = limpio)."""
    violaciones: list[str] = []
    arbol = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))

    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Import):
            for alias in nodo.names:
                nombre = alias.name or ""
                base = nombre.split(".")[0]
                if base in ("os", "subprocess", "importlib", "pickle", "yaml",
                            "socket") or (
                        base in ("urllib", "http")
                        and not _red_permitida(path, nombre)):
                    violaciones.append(f"{path.name}:{nodo.lineno} import {nombre}")
                if any(nombre == p or nombre.startswith(p + ".")
                       for p in IMPORTS_PROHIBIDOS):
                    violaciones.append(f"{path.name}:{nodo.lineno} import {nombre}")
        elif isinstance(nodo, ast.ImportFrom):
            mod = _modulo_de(nodo)
            if any(mod == p or mod.startswith(p + ".")
                   for p in IMPORTS_PROHIBIDOS):
                violaciones.append(f"{path.name}:{nodo.lineno} from {mod} import ...")
            for alias in nodo.names:
                if alias.name in NOMBRES_PROHIBIDOS:
                    violaciones.append(
                        f"{path.name}:{nodo.lineno} from {mod} import {alias.name}")
        elif isinstance(nodo, ast.Call):
            func = nodo.func
            nombre = ""
            if isinstance(func, ast.Name):
                nombre = func.id
                if nombre in BUILTINS_PROHIBIDOS:
                    violaciones.append(f"{path.name}:{nodo.lineno} {nombre}(...)")
                if nombre == "text":
                    violaciones.append(f"{path.name}:{nodo.lineno} text(...)")
            elif isinstance(func, ast.Attribute):
                nombre = func.attr
                if nombre in ATRIBUTOS_PROHIBIDOS:
                    violaciones.append(f"{path.name}:{nodo.lineno} .{nombre}(...)")
                if nombre == "add":
                    receptor = func.value
                    if (isinstance(receptor, ast.Name)
                            and receptor.id in RECEPTORES_SESION):
                        violaciones.append(
                            f"{path.name}:{nodo.lineno} sesion.add(...)")
                if nombre == "execute" and nodo.args:
                    primero = nodo.args[0]
                    if isinstance(primero, (ast.Constant, ast.JoinedStr)):
                        violaciones.append(
                            f"{path.name}:{nodo.lineno} .execute() con string SQL")
                if nombre in ("getenv", "environ"):
                    violaciones.append(
                        f"{path.name}:{nodo.lineno} acceso a env (.{nombre})")
        elif isinstance(nodo, ast.JoinedStr):
            texto = " ".join(
                v.value.upper() for v in nodo.values
                if isinstance(v, ast.Constant) and isinstance(v.value, str))
            import re
            for palabra in SQL_EN_FSTRING:
                if re.search(rf"\b{palabra}\b", texto):
                    violaciones.append(
                        f"{path.name}:{nodo.lineno} f-string con SQL ({palabra})")
                    break
    return violaciones


def test_chat_sin_escritura_sql_ni_ejecucion():
    errores: list[str] = []
    for path in _archivos_chat():
        errores.extend(auditar_archivo(path))
    assert not errores, (
        "Módulo chatbot con capacidad de escritura/ejecución:\n- "
        + "\n- ".join(errores))
