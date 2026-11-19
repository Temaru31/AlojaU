"""Helper paginación limpia - usado en list_publicaciones"""


def paginate_params(page: int = 1, size: int = 9):
    page = max(1, page)
    size = min(max(1, size), 50)
    offset = (page - 1) * size
    return offset, size

def build_paginated(items: list, total: int, page: int, size: int):
    pages = (total + size - 1) // size if size else 1
    return {
        "items": items,
        "total": total,
        "page": page,
        "size": size,
        "pages": pages,
    }
