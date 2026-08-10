"""Reservar un documento mientras se edita, para que dos personas no se pisen.

EL PROBLEMA
-----------
No habia nada. Dos personas abrian el mismo Word, cada una editaba dos horas, y
la segunda que subia pisaba a la primera.

Ojo con el matiz, porque cambia lo que hay que arreglar: el versionado NO pierde
el dato -- la version anterior sobrevive en file_versions y se puede recuperar. Lo
que se pierde es el TRABAJO: las dos horas de la persona a la que le pasaron por
encima, y el rato de averiguar cual de las dos versiones vale. Esa es la forma
mas comun de que alguien deje de fiarse de una plataforma.

QUE BLOQUEA Y QUE NO
--------------------
Bloquea lo que puede destruir el trabajo de otro: subir una version nueva,
renombrar, mover, borrar y cambiar de estado.

NO bloquea leer ni descargar. Un plano reservado se sigue viendo y se sigue
usando en obra: reservar no es esconder, y una obra parada porque alguien tiene
un fichero abierto seria peor que el problema que venimos a resolver.

COMO SE SALE DE UN BLOQUEO OLVIDADO
-----------------------------------
Es la pregunta que hunde estos sistemas. Alguien reserva un documento un viernes,
se va de vacaciones, y el fichero queda muerto.

Aqui: lo suelta quien lo reservo, o un administrador en cualquier momento. Y
pasados unos dias el bloqueo se marca como OLVIDADO -- no se suelta solo, porque
soltarlo por detras haria creer a quien lo tenia que su reserva seguia en pie --
pero cualquiera con permiso de edicion puede forzarlo, y queda registrado quien
lo hizo y a quien se lo quito.
"""

from datetime import datetime, timedelta, timezone

from app_logging import get_logger

logger = get_logger('bloqueo')

# A partir de aqui el bloqueo se considera olvidado y se puede forzar sin ser
# administrador. Una semana: suficiente para un documento que se trabaja de
# verdad, corto para uno que se quedo colgado.
DIAS_HASTA_OLVIDADO = 7


class DocumentoReservado(Exception):
    """Lleva el motivo ya redactado para el usuario."""

    def __init__(self, motivo, por=None):
        super().__init__(motivo)
        self.motivo = motivo
        self.por = por


def _quien(usuario):
    if not isinstance(usuario, dict):
        return None
    return usuario.get('email') or usuario.get('name') or (
        f"usuario:{usuario.get('id')}" if usuario.get('id') else None)


def estado(cursor, node_id):
    """(por, desde, olvidado) o (None, None, False) si esta libre."""
    cursor.execute(
        "SELECT bloqueado_por, bloqueado_en FROM file_nodes WHERE id = %s",
        (str(node_id),))
    fila = cursor.fetchone()
    if not fila or not fila[0]:
        return None, None, False
    por, desde = fila[0], fila[1]
    olvidado = False
    if desde:
        limite = datetime.now(timezone.utc) - timedelta(days=DIAS_HASTA_OLVIDADO)
        cuando = desde if desde.tzinfo else desde.replace(tzinfo=timezone.utc)
        olvidado = cuando < limite
    return por, desde, olvidado


def comprobar_libre(cursor, node_id, usuario, accion='modificar este documento'):
    """Lanza DocumentoReservado si lo tiene otra persona. No hace nada si esta libre.

    Es la funcion que se llama ANTES de subir, renombrar, mover, borrar o cambiar
    de estado. Quien tiene la reserva pasa sin mas: reservar es para poder
    trabajar, no para bloquearse a uno mismo.
    """
    por, desde, olvidado = estado(cursor, node_id)
    if not por:
        return
    if por == _quien(usuario):
        return
    if isinstance(usuario, dict) and usuario.get('role') == 'admin':
        return   # un administrador no se queda fuera de su propia obra
    cuando = f" desde el {desde:%d/%m/%Y}" if desde else ""
    aviso = " (lleva más de una semana: puedes forzar la liberación)" if olvidado else ""
    raise DocumentoReservado(
        f"No puedes {accion}: lo tiene reservado {por}{cuando}{aviso}.", por=por)


def reservar(cursor, model_urn, node_id, usuario):
    """Reserva el documento para esta persona."""
    quien = _quien(usuario)
    if not quien:
        raise DocumentoReservado("Hace falta una sesión para reservar un documento.")

    cursor.execute(
        "SELECT name, node_type, bloqueado_por FROM file_nodes "
        "WHERE id = %s AND model_urn = %s AND is_deleted = FALSE",
        (str(node_id), model_urn))
    fila = cursor.fetchone()
    if not fila:
        raise DocumentoReservado("El documento no está en esta obra.")
    nombre, tipo, ya_por = fila
    if tipo != 'FILE':
        # Reservar una carpeta no significa nada: lo que se edita son los
        # documentos, y bloquear la carpeta daria una falsa sensacion de reserva
        # sobre todo lo que hay dentro.
        raise DocumentoReservado("Las carpetas no se reservan; reserva los documentos.")
    if ya_por and ya_por != quien:
        raise DocumentoReservado(f"Ya lo tiene reservado {ya_por}.", por=ya_por)

    cursor.execute(
        "UPDATE file_nodes SET bloqueado_por = %s, bloqueado_en = CURRENT_TIMESTAMP "
        "WHERE id = %s AND model_urn = %s",
        (quien, str(node_id), model_urn))
    _auditar(cursor, model_urn, node_id, nombre, 'reserva_documento', quien,
             {'reservado_por': quien})
    return {'bloqueado_por': quien, 'nombre': nombre}


def liberar(cursor, model_urn, node_id, usuario, forzar=False):
    """Suelta la reserva. Quien la tiene, o un administrador, o forzada si esta olvidada."""
    quien = _quien(usuario)
    por, _desde, olvidado = estado(cursor, node_id)
    if not por:
        return {'bloqueado_por': None, 'ya_estaba_libre': True}

    es_admin = isinstance(usuario, dict) and usuario.get('role') == 'admin'
    propio = (por == quien)
    if not (propio or es_admin or (forzar and olvidado)):
        raise DocumentoReservado(
            f"La reserva es de {por}. Solo puede soltarla esa persona o un "
            f"administrador.", por=por)

    cursor.execute("SELECT name FROM file_nodes WHERE id = %s", (str(node_id),))
    fila = cursor.fetchone()
    nombre = fila[0] if fila else str(node_id)

    cursor.execute(
        "UPDATE file_nodes SET bloqueado_por = NULL, bloqueado_en = NULL "
        "WHERE id = %s AND model_urn = %s",
        (str(node_id), model_urn))
    # Quitarle la reserva a otro NO es lo mismo que soltar la tuya: queda dicho
    # a quien se le quito, que es lo que se pregunta despues.
    detalle = {'reserva_de': por}
    if not propio:
        detalle['retirada_por'] = quien
        detalle['forzada'] = bool(forzar and olvidado and not es_admin)
    _auditar(cursor, model_urn, node_id, nombre,
             'reserva_documento' if propio else 'reserva_retirada', quien, detalle)
    return {'bloqueado_por': None, 'era_de': por}


def _auditar(cursor, model_urn, node_id, nombre, accion, quien, detalle):
    import json as _json
    try:
        cursor.execute(
            "INSERT INTO activity_log "
            "(model_urn, action, entity_type, entity_id, entity_name, performed_by, details) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (model_urn, accion, 'file', str(node_id), nombre, quien,
             _json.dumps(detalle)))
    except Exception as e:  # pragma: no cover - defensivo
        logger.warning(f"no se pudo registrar la reserva de {nombre}: {e}")
