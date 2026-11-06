#!/usr/bin/env python3
"""Limpia imágenes residuales de pruebas en backend/uploads/ (Tarea 1, v4).

Uso: python3 backend/scripts/limpiar_uploads.py [--dry-run]
- Borra todo en backend/uploads/ EXCEPTO .gitkeep.
- Los tests ya no deben dejar basura (ver fixture `uploads_limpio` en
  backend/tests/conftest.py); este script es para residuos históricos.
"""

import argparse
import sys
from pathlib import Path

UPLOADS = Path(__file__).resolve().parent.parent / "uploads"


def limpiar(dry_run: bool = False) -> int:
    if not UPLOADS.is_dir():
        print(f"[limpiar_uploads] sin carpeta {UPLOADS}, nada que hacer.")
        return 0
    borrados = 0
    for f in sorted(UPLOADS.iterdir()):
        if f.name == ".gitkeep":
            continue
        if f.is_file() or f.is_symlink():
            if dry_run:
                print(f"  [dry-run] borraría {f.name}")
            else:
                f.unlink()
            borrados += 1
    print(f"[limpiar_uploads] {borrados} archivo(s) {'(dry-run)' if dry_run else 'eliminados'}. .gitkeep intacto.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Limpia backend/uploads/ salvo .gitkeep")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    sys.exit(limpiar(args.dry_run))
