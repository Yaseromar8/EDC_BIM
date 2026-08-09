"""Quien pidio cada documento y cuando.

EL HUECO QUE CIERRA
-------------------
No habia ni una fila que dijera que alguien se habia llevado un plano. Es la
primera pregunta de una supervision -- "quien tuvo acceso a este documento y
cuando" -- y la que casi nunca esta registrada.

QUE SE REGISTRA EXACTAMENTE, Y QUE NO
-------------------------------------
Honestidad por delante: lo que la plataforma entrega en la mayoria de los casos
es una URL FIRMADA del almacenamiento, y la transferencia de los bytes ocurre
despues, contra Google, sin volver a pasar por aqui. Asi que esto NO registra
"fulano completo la descarga": registra "a fulano se le entrego el acceso a este
documento, a esta hora, por esta via". Que es lo que se puede afirmar sin mentir,
y ademas es lo que importa para el control: quien pudo llevarselo.

Por eso la accion se llama 'acceso_a_documento' y no 'descarga'.

POR QUE VA CON FRENO
--------------------
Un lector de PDF pide el mismo fichero por trozos y un album de obra carga
docenas de miniaturas de golpe. Sin freno, abrir un plano escribiria veinte
lineas identicas y el registro dejaria de leerse, que es la forma mas comun de
que un registro no sirva para nada. Se guarda UNA por persona, documento y
ventana de tiempo.
"""

import time

from app_logging import get_logger

logger = get_logger('descargas')

# Ventana del freno. Cinco minutos: suficiente para que abrir un plano y hojearlo
# sea una linea, y corto para que volver a por el mismo documento por la tarde
# quede registrado aparte.
VENTANA = 300
_ANOTADOS_MAX = 20000
_anotados = {}


def olvidar():
    """Vacia el freno. Para las pruebas."""
    _anotados.clear()


def _reciente(clave, ahora):
    visto = _anotados.get(clave)
    if visto is not None and (ahora - visto) < VENTANA:
        return True
    if len(_anotados) >= _ANOTADOS_MAX:
        _anotados.clear()
    _anotados[clave] = ahora
    return False


def _quien(user):
    if not isinstance(user, dict):
        return None
    return user.get('email') or user.get('name') or (
        f"usuario:{user.get('id')}" if user.get('id') else None)


def registrar(user, ambito, via, gcs_urn=None, node_id=None, ip=None, ahora=None):
    """Anota que se entrego el acceso a un documento. Nunca revienta al llamante.

    Un fallo aqui no puede tumbar la entrega del fichero: el registro es
    importante, pero dejar al equipo de obra sin poder abrir un plano porque la
    tabla de auditoria tiene un problema seria peor.
    """
    ahora = time.time() if ahora is None else ahora
    quien = _quien(user)
    clave = (quien or 'enlace-firmado', str(node_id or gcs_urn or ''))
    if _reciente(clave, ahora):
        return False

    try:
        from db import get_db_connection
        import json as _json
        with get_db_connection() as conn:
            cur = conn.cursor()
            nombre = None
            if node_id:
                cur.execute("SELECT name FROM file_nodes WHERE id = %s", (str(node_id),))
            elif gcs_urn:
                cur.execute(
                    "SELECT n.name FROM file_nodes n WHERE n.gcs_urn = %s "
                    "UNION ALL "
                    "SELECT n.name FROM file_versions v JOIN file_nodes n ON n.id = v.file_node_id "
                    "WHERE v.gcs_urn = %s LIMIT 1",
                    (gcs_urn, gcs_urn))
            fila = cur.fetchone() if (node_id or gcs_urn) else None
            nombre = fila[0] if fila else None
            # Solo se registran documentos del arbol. Las miniaturas de las fotos
            # de campo entran por la misma ruta y anotarlas convertiria el
            # historial en ruido: mil lineas de fotos tapan la unica que importa.
            if not nombre:
                return False
            cur.execute(
                "INSERT INTO activity_log "
                "(model_urn, action, entity_type, entity_id, entity_name, performed_by, details) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (ambito or 'global', 'acceso_a_documento', 'file',
                 str(node_id) if node_id else None, nombre, quien,
                 _json.dumps({'via': via, 'ip': ip,
                              'nota': 'se entregó el acceso; la transferencia ocurre '
                                      'contra el almacenamiento'})),
            )
            conn.commit()
        return True
    except Exception as e:  # pragma: no cover - defensivo
        logger.warning(f"no se pudo registrar el acceso al documento: {e}")
        return False
