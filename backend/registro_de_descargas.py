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
    """Solo CONSULTA. No marca."""
    visto = _anotados.get(clave)
    return visto is not None and (ahora - visto) < VENTANA


def _anotar_freno(clave, ahora):
    """Marca, y solo DESPUES de que la fila se haya escrito de verdad.

    Marcarla antes de escribir hacia que un fallo de la base perdiera el acceso Y
    ademas silenciara los cinco minutos siguientes: el peor de los dos mundos,
    porque el hueco en el registro quedaba tapado.
    """
    if len(_anotados) >= _ANOTADOS_MAX:
        _anotados.clear()
    _anotados[clave] = ahora


def _es_evidencia_de_campo(nombre):
    """Fotos y videos de obra: NO se anotan.

    Esto estaba mal razonado en la primera version. Se suponia que las fotos
    vivian solo en photo_evidences y que por tanto quedaban fuera solas; pero en
    esta obra las fotos de WhatsApp SI estan en file_nodes -- son 2.676 de 2.831
    ficheros -- asi que el filtro no filtraba nada y el historial se habria
    llenado de miniaturas. Mil lineas de fotos tapan la unica que importa, que es
    quien se llevo el plano.

    Si algun dia hace falta registrar tambien los accesos a las fotos, que sea una
    decision explicita y con su propio sitio donde mirarlas, no mezcladas aqui.
    """
    from nomenclatura import EXENTAS_POR_DEFECTO
    ext = nombre.rsplit('.', 1)[1].lower() if (nombre and '.' in nombre) else ''
    return ext in set(EXENTAS_POR_DEFECTO)


def _quien(user):
    if not isinstance(user, dict):
        return None
    return user.get('email') or user.get('name') or (
        f"usuario:{user.get('id')}" if user.get('id') else None)


def registrar(user, ambito, via, gcs_urn=None, node_id=None, ip=None, ahora=None,
              discriminante=None):
    """Anota que se entrego el acceso a un documento. Nunca revienta al llamante.

    Un fallo aqui no puede tumbar la entrega del fichero: el registro es
    importante, pero dejar al equipo de obra sin poder abrir un plano porque la
    tabla de auditoria tiene un problema seria peor.
    """
    ahora = time.time() if ahora is None else ahora
    quien = _quien(user)
    # El 'discriminante' separa accesos que no llevan persona identificada. Sin el,
    # dos personas distintas abriendo el mismo documento por dos enlaces firmados
    # distintos compartian clave y la segunda no quedaba registrada: el freno
    # tapaba justo lo que hay que poder ver.
    clave = (quien or f'enlace-firmado:{discriminante or ""}',
             str(node_id or gcs_urn or ''))
    if _reciente(clave, ahora):
        return False

    try:
        from db import get_db_connection
        import json as _json
        with get_db_connection() as conn:
            cur = conn.cursor()
            # De la misma consulta salen las TRES cosas que hacen falta: el
            # nombre, el id del documento y la obra. Antes se pedia solo el
            # nombre, y por eso la fila se escribia con entity_id vacio (el
            # expediente del documento no la encontraba, porque busca por id) y
            # con la obra en 'global' (el historial de la obra tampoco).
            if node_id:
                cur.execute("SELECT id, name, model_urn FROM file_nodes WHERE id = %s",
                            (str(node_id),))
            elif gcs_urn:
                cur.execute(
                    "SELECT n.id, n.name, n.model_urn FROM file_nodes n WHERE n.gcs_urn = %s "
                    "UNION ALL "
                    "SELECT n.id, n.name, n.model_urn FROM file_versions v "
                    "JOIN file_nodes n ON n.id = v.file_node_id WHERE v.gcs_urn = %s LIMIT 1",
                    (gcs_urn, gcs_urn))
            fila = cur.fetchone() if (node_id or gcs_urn) else None
            if not fila:
                return False
            doc_id, nombre, obra = str(fila[0]), fila[1], fila[2]

            if _es_evidencia_de_campo(nombre):
                # Se marca igualmente: la decision depende solo del nombre y no va
                # a cambiar, y sin marcar un album de 200 miniaturas haria 200
                # consultas a la base para acabar decidiendo lo mismo 200 veces.
                _anotar_freno(clave, ahora)
                return False

            cur.execute(
                "INSERT INTO activity_log "
                "(model_urn, action, entity_type, entity_id, entity_name, performed_by, details) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (ambito or obra or 'global', 'acceso_a_documento', 'file',
                 doc_id, nombre, quien,
                 _json.dumps({'via': via, 'ip': ip,
                              'nota': 'se entregó el acceso; la transferencia ocurre '
                                      'contra el almacenamiento'})),
            )
            conn.commit()
        _anotar_freno(clave, ahora)
        return True
    except Exception as e:  # pragma: no cover - defensivo
        logger.warning(f"no se pudo registrar el acceso al documento: {e}")
        return False
