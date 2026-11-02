"""Ajustes del sistema por defecto (system_settings), editables desde el panel admin."""

DEFAULTS = {
    # (valor, tipo, descripcion, seccion). Secciones UI: publicaciones,
    # moderacion, visibilidad. Añadir clave = aparece sola en el panel.
    "dias_vigencia_publicacion": ("30", "int", "Días de vigencia al publicar/renovar", "publicaciones"),
    "max_reportes_para_pausa_automatica": ("3", "int", "Reportes que pausan el aviso", "moderacion"),
    "auto_aprobar_arrendadores_verificados": ("false", "bool", "Auto-aprobar verificados", "moderacion"),
    # Auto-moderación + UX (ver services/auto_moderation.py).
    "moderacion_automatica": ("false", "bool", "Switch global de moderación automática", "moderacion"),
    "umbral_aprobacion_ia": ("0.85", "float", "Score mínimo (0-1) para auto-aprobar", "moderacion"),
    "dias_desactualizada": ("30", "int", "Días para badge 'Desactualizada'", "publicaciones"),
    "titulo_min": ("10", "int", "Mínimo de caracteres del título", "publicaciones"),
    "titulo_max": ("150", "int", "Máximo de caracteres del título", "publicaciones"),
    "descripcion_min": ("20", "int", "Mínimo de caracteres de la descripción", "publicaciones"),
    "descripcion_max": ("2000", "int", "Máximo de caracteres de la descripción", "publicaciones"),
    "fotos_min_publicar": ("3", "int", "Mínimo de fotos al publicar", "publicaciones"),
    "palabras_prohibidas": ("viagra,casino,cripto,x1000", "str", "Spam separado por comas", "moderacion"),
    # v15.x visibilidad de vistas (False = solo dueño/admin, prudente).
    "vistas_visibles_publico": ("false", "bool", "Mostrar vistas a todo visitante", "visibilidad"),
}
