"""Chatbot AlojaU: asistente de ayuda sobre las funcionalidades de la app.

REGLAS INVIOLABLES DE ESTE MÓDULO (verificadas por tests/seguridad/chat/):
- NO accede a la base de datos: ni sesión, ni modelos, ni repositorios, ni SQL.
  Su única fuente es la base de conocimiento en `kb/*.md` (texto estático).
- Sin herramientas para el modelo: el orquestador recupera fragmentos de la
  KB y los entrega como DATOS; el modelo solo redacta la respuesta.
- Sin escritura, sin ejecución de código, sin red salvo el proveedor LLM.
"""
