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


# ── El secreto TOTP, cifrado en reposo ─────────────────────────────────────
# POR QUE
# -------
# Se guardaba en claro en `users.totp_secreto`. Y ese secreto es MAS peligroso
# que un codigo suelto: con el se generan codigos validos infinitos, para
# siempre. Lo grave no era la base en si, era por donde sale: LA COPIA DE
# SEGURIDAD LO LLEVA DENTRO. Ese fichero se descarga, se guarda, se mueve --
# quien lo tenga puede generar el segundo factor de cualquier cuenta, incluida
# la del administrador de una entidad. El segundo factor dejaba de ser un
# segundo factor.
#
# Habia ademas una ironia: los codigos de recuperacion SI iban protegidos
# (HMAC con pimienta) y son los menos peligrosos de los dos.
#
# La clave sale de APP_SECRET, que vive FUERA de la base -- el mismo motivo por
# el que la pimienta de las sesiones tampoco esta ahi. Una copia de la base, sin
# el entorno, ya no sirve para generar codigos.
_PREFIJO_CIFRADO = 'v1:'


class SecretoIlegible(Exception):
    """El secreto esta cifrado con OTRA clave. Se dice, no se falla en silencio.

    Si APP_SECRET se rota, los secretos guardados dejan de poder descifrarse.
    Eso ya paso con los codigos de recuperacion y la pimienta, y lo grave no fue
    perderlos: fue que el sistema seguia diciendo que estaban bien. Aqui se
    distingue «el codigo no vale» de «ya no puedo leer tu secreto», que llevan a
    acciones distintas.
    """


def _clave_de_cifrado():
    base = (os.getenv('APP_SECRET') or os.getenv('SESSION_PEPPER') or '').strip()
    if not base:
        return None
    return base64.urlsafe_b64encode(hashlib.sha256(b'totp:' + base.encode()).digest())


def huella_de_la_clave():
    """8 caracteres que identifican QUE clave cifro un secreto. Nunca el valor."""
    clave = _clave_de_cifrado()
    return hashlib.sha256(clave).hexdigest()[:8] if clave else '--------'


def cifrar_secreto(secreto):
    """Deja el secreto listo para guardar. Sin APP_SECRET lo devuelve tal cual."""
    if not secreto or secreto.startswith(_PREFIJO_CIFRADO):
        return secreto
    clave = _clave_de_cifrado()
    if not clave:
        logger.warning('[2fa] sin APP_SECRET: el secreto TOTP se guarda EN CLARO')
        return secreto
    from cryptography.fernet import Fernet
    return '%s%s:%s' % (_PREFIJO_CIFRADO, huella_de_la_clave(),
                        Fernet(clave).encrypt(secreto.encode()).decode())


def descifrar_secreto(guardado):
    """El secreto utilizable. Tolera los que quedaron en claro de antes."""
    if not guardado or not guardado.startswith(_PREFIJO_CIFRADO):
        return guardado          # anterior al cifrado: se lee tal cual
    try:
        _v, huella, token = guardado.split(':', 2)
    except ValueError:
        raise SecretoIlegible('el secreto guardado no tiene la forma esperada')
    if huella != huella_de_la_clave():
        raise SecretoIlegible('cifrado con una clave distinta de la actual')
    from cryptography.fernet import Fernet, InvalidToken
    try:
        return Fernet(_clave_de_cifrado()).decrypt(token.encode()).decode()
    except InvalidToken:
        raise SecretoIlegible('no se puede descifrar con la clave actual')


def cifrar_los_que_quedaron_en_claro(cursor):
    """Migra a cifrado los secretos que se guardaron antes. Idempotente."""
    if not _clave_de_cifrado():
        return 0
    cursor.execute("SELECT id, totp_secreto FROM users"
                   " WHERE totp_secreto IS NOT NULL AND totp_secreto <> ''"
                   "   AND totp_secreto NOT LIKE %s", (_PREFIJO_CIFRADO + '%',))
    filas = cursor.fetchall()
    for uid, secreto in filas:
        cursor.execute("UPDATE users SET totp_secreto = %s WHERE id = %s",
                       (cifrar_secreto(secreto), uid))
    if filas:
        logger.info('[2fa] %d secreto(s) TOTP pasados a cifrado', len(filas))
    return len(filas)


def paso_de(secreto, codigo_dado, momento=None):
    """El intervalo (paso de 30 s) al que corresponde el codigo, o None si no vale.

    Devolver el PASO y no solo un si/no es lo que permite impedir que el mismo
    codigo se canjee dos veces: ver `consumir()`.
    """
    if not secreto or not codigo_dado:
        return None
    dado = str(codigo_dado).strip().replace(' ', '')
    if not dado.isdigit() or len(dado) != DIGITOS:
        return None
    ahora = momento if momento is not None else time.time()
    for salto in range(-VENTANA, VENTANA + 1):
        instante = ahora + salto * INTERVALO
        # compare_digest y no ==: comparar cadenas byte a byte filtra por tiempo
        # cuantas cifras iniciales acertaste, y con 6 cifras eso importa.
        if hmac.compare_digest(codigo(secreto, instante), dado):
            return int(instante // INTERVALO)
    return None


def comprobar(secreto, codigo_dado, momento=None):
    """¿Es valido el codigo? Compara en tiempo constante y admite deriva de reloj.

    OJO: esto NO impide reutilizarlo. Para el canje real usa `consumir()`.
    """
    return paso_de(secreto, codigo_dado, momento) is not None


def consumir(cursor, user_id, secreto, codigo_dado, momento=None):
    """Canjea un codigo TOTP UNA sola vez. Devuelve True si valia y se acepto.

    POR QUE NO BASTA CON `comprobar()`
    ----------------------------------
    Un codigo TOTP vale durante su paso de 30 s (mas la ventana de deriva), y
    `comprobar()` dice que si tantas veces como se lo preguntes. Medido: el mismo
    codigo entraba dos veces seguidas y las dos entregaban sesion. El RFC 6238
    (§5.2) lo dice sin rodeos: el verificador NO debe aceptar un segundo intento
    del codigo generado para la misma ventana de tiempo.

    Importa porque el codigo viaja: se lee en voz alta, se manda por WhatsApp al
    compañero que esta en obra, se queda en el portapapeles. Quien lo vea pasar
    tiene medio minuto para usarlo -- y con esto, solo si llega primero.

    Se guarda el ULTIMO paso canjeado y se exige que el nuevo sea POSTERIOR: asi
    tampoco vale un codigo anterior todavia dentro de la ventana de deriva.
    """
    paso = paso_de(secreto, codigo_dado, momento)
    if paso is None:
        return False
    cursor.execute('SELECT totp_ultimo_paso FROM users WHERE id = %s', (user_id,))
    fila = cursor.fetchone()
    ultimo = (fila or [None])[0]
    if ultimo is not None and paso <= int(ultimo):
        return False
    cursor.execute('UPDATE users SET totp_ultimo_paso = %s WHERE id = %s', (paso, user_id))
    return True


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


def _pimienta():
    return (os.getenv('SESSION_PEPPER') or os.getenv('APP_SECRET') or 'sin-pimienta').encode()


def huella_de_la_pimienta():
    """12 caracteres que identifican QUE pimienta hasheo un codigo. Nunca el valor.

    POR QUE HACE FALTA ESTO
    -----------------------
    Los codigos de recuperacion se guardan como HMAC(pimienta, codigo) y solo se
    enseñan UNA vez. El dia que se define o se rota SESSION_PEPPER --que es una
    operacion de seguridad normal, no una rareza-- las huellas guardadas dejan de
    corresponder para siempre a los codigos que su dueño lleva en papel.

    Eso ya seria malo. Lo grave era que fallaba EN SILENCIO: la pantalla de
    seguridad contaba filas de la tabla y seguia diciendo «te quedan 8 validos»
    cuando quedaban cero. Su dueño se enteraba el dia que perdia el telefono, que
    es exactamente el dia para el que existen.

    Guardando esta huella junto a cada codigo, el sistema puede DECIR que le paso:
    no los recupera --nadie puede-- pero deja de mentir sobre ellos.
    """
    return hashlib.sha256(_pimienta()).hexdigest()[:12]


def huella_de_codigo(codigo_recuperacion):
    """Huella de un codigo de recuperacion, con la misma pimienta de las sesiones."""
    return hmac.new(_pimienta(), codigo_recuperacion.strip().lower().encode(),
                    hashlib.sha256).hexdigest()


def asegurar_columnas(cursor):
    """Las columnas del segundo factor. Se llama desde el bootstrap."""
    cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secreto VARCHAR(64)")
    # ENSANCHAR ANTES DE CIFRAR. El secreto en claro son 32 caracteres y cabia de
    # sobra en VARCHAR(64); cifrado pasa de 150 y la base lo rechaza con «value
    # too long». Si esto corriera DESPUES de la migracion de abajo, la migracion
    # fallaria entera. El orden no es estetico.
    cursor.execute("ALTER TABLE users ALTER COLUMN totp_secreto TYPE TEXT")
    cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_activo BOOLEAN DEFAULT FALSE")
    cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_activado_en TIMESTAMP WITH TIME ZONE")
    # El ultimo paso de 30 s ya canjeado. Es lo que impide reutilizar un codigo
    # dentro de su propia ventana de validez. Ver consumir().
    cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_ultimo_paso BIGINT")
    # Los de recuperacion, hasheados y de un solo uso.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS totp_recuperacion (
            id       SERIAL PRIMARY KEY,
            user_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
            huella   CHAR(64) NOT NULL,
            usado_en TIMESTAMP WITH TIME ZONE
        )""")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_totp_recup_user ON totp_recuperacion(user_id)")
    # Con que pimienta se hasheo cada codigo. Ver huella_de_la_pimienta().
    cursor.execute("ALTER TABLE totp_recuperacion ADD COLUMN IF NOT EXISTS pimienta VARCHAR(12)")
    # SELLAR LO QUE YA HABIA, Y HACERLO ANTES DE LA PRIMERA ROTACION.
    # Los codigos anteriores a esta columna se hashearon con la pimienta que este
    # proceso tiene AHORA MISMO: sellarlos con la huella actual es registrar un
    # hecho, no adivinarlo. Y tiene que pasar en el arranque ANTERIOR al cambio:
    # si se dejaran a NULL, tras rotar seguirian contandose como validos --que es
    # justo la mentira que esta columna existe para acabar-- y si se sellaran DESPUES
    # de rotar, se les pondria la huella nueva y quedarian marcados como buenos
    # siendo ya inservibles. Una vez sellados no vuelve a haber NULL, asi que esta
    # sentencia no puede volver a equivocarse.
    cursor.execute("UPDATE totp_recuperacion SET pimienta = %s WHERE pimienta IS NULL",
                   (huella_de_la_pimienta(),))
    # Y los secretos TOTP que se guardaron en claro, a cifrado. Va aqui porque es
    # el sitio por el que pasa el despliegue, y porque dejarlo para «cuando cada
    # usuario vuelva a darse de alta» significa no hacerlo nunca.
    cifrar_los_que_quedaron_en_claro(cursor)


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
