"""Limitador de peticiones compartido.

Vive en su propio modulo (no en server.py) para que las rutas puedan decorarse
sin importar server.py y provocar un ciclo de imports. Se instancia sin app y
se enchufa con init_app() desde server.py.

Historia: Flask-Limiter se construia en server.py pero NO estaba en
requirements.txt, asi que en Render saltaba el except ImportError y el limitador
quedaba en None. El resultado era fuerza bruta ilimitada contra /api/auth/login
sin que nada lo delatara salvo un print de arranque que nadie lee. Por eso aqui
el estado se registra explicitamente y `limite` es tolerante: si la libreria
faltara, la app arranca igual en vez de caerse en el import de cada ruta.
"""

import os

from app_logging import get_logger

logger = get_logger('rate_limit')

# Con REDIS_URL (Render Key Value) el contador es COMPARTIDO entre los workers
# de gunicorn y el limite es exacto. Sin el, cada worker cuenta por su cuenta y
# el limite efectivo se multiplica por el numero de workers.
REDIS_URL = os.getenv('REDIS_URL', '').strip()

try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address

    limiter = Limiter(
        key_func=get_remote_address,
        default_limits=["200 per minute"],
        storage_uri=REDIS_URL or "memory://",
    )
    if REDIS_URL:
        logger.info("Limitador con almacen compartido (REDIS_URL): limites exactos entre workers.")
    else:
        logger.warning(
            "Limitador en memoria de proceso: con varios workers el limite efectivo "
            "se multiplica por el numero de workers. Define REDIS_URL para exactitud."
        )
except ImportError:  # pragma: no cover - solo si falta la dependencia
    limiter = None
    logger.error("Flask-Limiter NO instalado: sin proteccion de fuerza bruta. pip install Flask-Limiter")


def limite(regla, **kwargs):
    """Decorador de limite tolerante a que la libreria no este instalada."""
    def decorador(fn):
        if limiter is None:
            return fn
        return limiter.limit(regla, **kwargs)(fn)
    return decorador


def clave_por_correo():
    """Clave de limite = correo del cuerpo, para que variar la IP no sirva.

    Combinada con el limite por IP, cubre los dos barridos: una IP probando
    muchas cuentas, y muchas IP probando una sola cuenta.
    """
    from flask import request
    cuerpo = request.get_json(silent=True) or {}
    correo = (cuerpo.get('email') or '').strip().lower()
    return f"correo:{correo}" if correo else f"ip:{request.remote_addr}"
