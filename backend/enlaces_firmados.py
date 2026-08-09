"""Enlaces firmados de un solo proposito (invitacion, reset, verificacion).

Un unico mecanismo para las tres cosas: el mismo secreto, distinto proposito
(el "salt" de itsdangerous) y distinta caducidad. Un token emitido para invitar
no sirve para resetear una contrasena, aunque el atacante lo tenga entero.

Por que hace falta: hasta ahora, reclamar una invitacion pendiente solo exigia
CONOCER EL CORREO. El admin creaba la fila con password_hash vacio y cualquiera
que enviara ese correo a /api/auth/register se quedaba con la cuenta y con el
ROL invitado, admin incluido. En obra los correos son publicos y predecibles
(nombre.apellido@contratista.com), asi que el "secreto" no era tal.
"""

import hashlib
import os

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app_logging import get_logger

logger = get_logger('enlaces')

PROPOSITO_INVITACION = 'invitacion-de-usuario'
PROPOSITO_RESET = 'reset-de-password'
PROPOSITO_VERIFICACION = 'verificacion-de-correo'
PROPOSITO_RECURSO = 'lectura-de-un-recurso'
PROPOSITO_OAUTH_APS = 'estado-oauth-autodesk'

# Caducidades por proposito, en segundos.
CADUCIDAD = {
    PROPOSITO_INVITACION: 14 * 24 * 3600,   # 14 dias: el invitado puede tardar
    PROPOSITO_RESET: 3600,                  # 1 hora
    PROPOSITO_VERIFICACION: 24 * 3600,      # 1 dia
    # Permiso de LECTURA de UN fichero concreto, para las etiquetas <img> y el
    # lector de PDF, que no pueden mandar cabecera de autorizacion. Sustituye al
    # '?session_token=' que se incrustaba en los permalinks de las fotos: aquello
    # era la sesion ENTERA, reutilizable y de 7 dias, guardada en la base y
    # compartida con quien recibiera la foto. Esto solo abre ese fichero y caduca.
    PROPOSITO_RECURSO: 24 * 3600,
    # El 'state' de OAuth: prueba de que el flujo lo empezamos NOSOTROS. Corto a
    # proposito, porque entre pulsar "conectar" y volver de Autodesk pasan
    # segundos, no horas.
    PROPOSITO_OAUTH_APS: 600,
}


def _secreto():
    """Clave de firma. Estable entre workers y entre reinicios, o no sirve."""
    directo = os.getenv('APP_SECRET', '').strip()
    if directo:
        return directo
    # Respaldo: derivar de la cadena de conexion, que ya es secreta y es igual
    # en los 4 workers y tras cada redespliegue. No es lo ideal (rota si rota la
    # base), pero es estable y evita que un despliegue sin APP_SECRET emita
    # tokens que se invalidan solos.
    base = os.getenv('DATABASE_URL') or os.getenv('DB_URL') or ''
    if not base:
        raise RuntimeError(
            "No hay APP_SECRET ni DATABASE_URL: no se pueden firmar enlaces. "
            "Define APP_SECRET en el entorno."
        )
    logger.warning("APP_SECRET no definido: firmando con clave derivada de DATABASE_URL. Define APP_SECRET.")
    return hashlib.sha256(f'enlaces-firmados|{base}'.encode()).hexdigest()


def emitir(proposito, datos):
    """Devuelve un token firmado y con marca de tiempo para ese proposito."""
    if proposito not in CADUCIDAD:
        raise ValueError(f"Proposito desconocido: {proposito}")
    return URLSafeTimedSerializer(_secreto(), salt=proposito).dumps(datos)


def leer(proposito, token):
    """Valida firma y antiguedad. Devuelve (datos, None) o (None, motivo)."""
    if proposito not in CADUCIDAD:
        raise ValueError(f"Proposito desconocido: {proposito}")
    if not token:
        return None, 'falta el token'
    try:
        datos = URLSafeTimedSerializer(_secreto(), salt=proposito).loads(
            token, max_age=CADUCIDAD[proposito]
        )
        return datos, None
    except SignatureExpired:
        return None, 'el enlace ha caducado'
    except BadSignature:
        return None, 'el enlace no es válido'
    except Exception as e:  # pragma: no cover - defensivo
        logger.error(f"error leyendo enlace firmado: {e}")
        return None, 'el enlace no es válido'
