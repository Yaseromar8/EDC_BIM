# -*- coding: utf-8 -*-
"""Segundo factor (TOTP) para las cuentas que pueden destruir el expediente.

QUE PROBLEMA ATACA
------------------
BASELINE 0 · C9: "Sin segundo factor sobre la cuenta que puede destruir el
expediente". Hoy, quien consiga la contrasena de la unica cuenta administradora
puede archivar obras, borrar documentos y repartir permisos. La contrasena es lo
unico que separa a un atacante de todo el ECD, y las contrasenas se pierden: se
reutilizan, se filtran de otros sitios, se escriben en un cuaderno.

POR QUE TOTP Y NO SMS NI CORREO
-------------------------------
El SMS se intercepta cambiando la tarjeta, y el correo es justo lo que un atacante
ya suele controlar cuando ha llegado hasta aqui. TOTP funciona sin red, sin coste y
sin depender de un tercero, y el usuario ya tiene la aplicacion (Google
Authenticator, Aegis, 1Password...).

POR QUE SIN LIBRERIA NUEVA
--------------------------
TOTP es HMAC-SHA1 sobre el numero de intervalo (RFC 6238) y base32 es de la
biblioteca estandar. Anadir una dependencia para treinta lineas mete una superficie
de suministro que hay que vigilar y actualizar, y este backend ya arrastra
suficiente. La implementacion de abajo es la del RFC, sin variaciones.

LO QUE NO RESUELVE
------------------
Un segundo factor protege el LOGIN. No protege la puerta de la base de datos: quien
tenga la credencial de PostgreSQL sigue entrando por debajo de la aplicacion sin
pasar por aqui. Eso es la separacion de identidades, y va aparte.
"""

import base64
import hashlib
import hmac
import os
import secrets
import struct
import time

from app_logging import get_logger

logger = get_logger('2fa')

DIGITOS = 6
INTERVALO = 30          # segundos por codigo, el estandar de facto
# Tolerancia de un intervalo hacia atras y otro hacia delante: los relojes de los
# telefonos se desvian, y rechazar por dos segundos de deriva convierte el segundo
# factor en algo que la gente desactiva.
VENTANA = 1


def secreto_nuevo():
    """Secreto en base32, que es lo que leen las aplicaciones de autenticacion."""
    return base64.b32encode(secrets.token_bytes(20)).decode('utf-8').rstrip('=')


def codigo(secreto, momento=None):
    """El codigo de 6 cifras para un instante dado. RFC 6238."""
    intervalo = int((momento if momento is not None else time.time()) // INTERVALO)
    clave = base64.b32decode(secreto + '=' * (-len(secreto) % 8), casefold=True)
    h = hmac.new(clave, struct.pack('>Q', intervalo), hashlib.sha1).digest()
    desplazamiento = h[-1] & 0x0F
    truncado = struct.unpack('>I', h[desplazamiento:desplazamiento + 4])[0] & 0x7FFFFFFF
    return str(truncado % (10 ** DIGITOS)).zfill(DIGITOS)


def comprobar(secreto, codigo_dado, momento=None):
    """¿Es valido el codigo? Compara en tiempo constante y admite deriva de reloj."""
    if not secreto or not codigo_dado:
        return False
    dado = str(codigo_dado).strip().replace(' ', '')
    if not dado.isdigit() or len(dado) != DIGITOS:
        return False
    ahora = momento if momento is not None else time.time()
    for salto in range(-VENTANA, VENTANA + 1):
        # compare_digest y no ==: comparar cadenas byte a byte filtra por tiempo
        # cuantas cifras iniciales acertaste, y con 6 cifras eso importa.
        if hmac.compare_digest(codigo(secreto, ahora + salto * INTERVALO), dado):
            return True
    return False


def uri_de_provisionamiento(secreto, correo, emisor='ECD Talara'):
    """La URI que se convierte en codigo QR para dar de alta la cuenta.

    No se genera aqui la imagen del QR: el navegador la dibuja a partir de esta
    cadena. Traer una libreria de imagenes al backend para esto seria absurdo.
    """
    from urllib.parse import quote
    return (f'otpauth://totp/{quote(emisor)}:{quote(correo)}'
            f'?secret={secreto}&issuer={quote(emisor)}&digits={DIGITOS}&period={INTERVALO}')


# ── Codigos de recuperacion ────────────────────────────────────────────────
# Sin ellos, perder el telefono significa perder la unica cuenta administradora del
# sistema, y entonces el segundo factor pasa de proteger el expediente a poner en
# riesgo el acceso a el. Se guardan HASHEADOS, como contrasenas: la base no debe
# poder devolverlos.

CODIGOS_RECUPERACION = 8


def codigos_de_recuperacion():
    """Genera los codigos en claro. Se muestran UNA vez y no se vuelven a poder ver."""
    return ['-'.join(secrets.token_hex(2) for _ in range(3)) for _ in range(CODIGOS_RECUPERACION)]


def huella_de_codigo(codigo_recuperacion):
    """Huella de un codigo de recuperacion, con la misma pimienta de las sesiones."""
    pimienta = (os.getenv('SESSION_PEPPER') or os.getenv('APP_SECRET') or 'sin-pimienta').encode()
    return hmac.new(pimienta, codigo_recuperacion.strip().lower().encode(),
                    hashlib.sha256).hexdigest()


def asegurar_columnas(cursor):
    """Las columnas del segundo factor. Se llama desde el bootstrap."""
    cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secreto VARCHAR(64)")
    cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_activo BOOLEAN DEFAULT FALSE")
    cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_activado_en TIMESTAMP WITH TIME ZONE")
    # Los de recuperacion, hasheados y de un solo uso.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS totp_recuperacion (
            id       SERIAL PRIMARY KEY,
            user_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
            huella   CHAR(64) NOT NULL,
            usado_en TIMESTAMP WITH TIME ZONE
        )""")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_totp_recup_user ON totp_recuperacion(user_id)")


def exigido_para(rol):
    """¿A quien se le exige?

    Por defecto, a quien puede destruir el expediente. Se puede endurecer a todos
    con EXIGIR_2FA=todos, pero NO se puede aflojar por debajo de admin: la cuenta
    que archiva obras es exactamente la que motivo este hallazgo.
    """
    alcance = os.getenv('EXIGIR_2FA', 'admin').strip().lower()
    if alcance == 'todos':
        return True
    return rol == 'admin'
