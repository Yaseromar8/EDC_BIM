"""
Logging central de la app. Reemplaza los print() sueltos por logging con niveles.

- Nivel configurable por entorno: LOG_LEVEL=DEBUG|INFO|WARNING|ERROR (default INFO).
  En produccion puedes subir a WARNING para silenciar ruido sin tocar codigo.
- Formato con timestamp, nivel y nombre de modulo, a stdout (lo captura Render).

Uso:
    from app_logging import get_logger
    logger = get_logger('auth')
    logger.info("evento"); logger.warning("ojo"); logger.error("fallo", exc_info=True)
"""
import logging
import os
import sys

_configured = False


def setup_logging():
    """Configura el root logger una sola vez (idempotente)."""
    global _configured
    if _configured:
        return
    level_name = os.getenv('LOG_LEVEL', 'INFO').upper()
    level = getattr(logging, level_name, logging.INFO)
    root = logging.getLogger()
    root.setLevel(level)
    if not root.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter(
            '%(asctime)s %(levelname)s [%(name)s] %(message)s', '%Y-%m-%d %H:%M:%S'))
        root.addHandler(handler)
    _configured = True


def get_logger(name):
    """Devuelve un logger con el nombre dado (configura el root si hace falta)."""
    setup_logging()
    return logging.getLogger(name)
