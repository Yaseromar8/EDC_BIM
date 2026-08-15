# -*- coding: utf-8 -*-
"""Llevar al visor un modelo que YA vive en el ECD, sin volver a subirlo.

EL HUECO QUE CIERRA
-------------------
Hoy un modelo se sube dos veces: una al gestor documental, como documento del
expediente, y otra al visor, desde el navegador del usuario. Son los mismos
bytes por dos caminos distintos, y de ahi salen las dos cosas que siempre pasan
cuando algo se guarda dos veces: se desincronizan, y nadie sabe cual manda.

Ademas rompe la trazabilidad justo donde importa. El documento del ECD tiene
estado, idoneidad, revision, huella y quien lo aprobo; el modelo del visor no
tiene nada de eso, porque llego por su cuenta. Mirando el visor no se puede
decir si lo que se esta viendo es la version aprobada.

Aqui el camino es uno solo: el documento del ECD **es** el modelo, y publicarlo
al visor es una operacion sobre el, no una subida nueva.

LO QUE ESTE MODULO DECIDE (y por que esta separado de la ruta)
--------------------------------------------------------------
Todo lo de abajo es logica pura, sin red y sin base: se puede probar sin gastar
un solo credito de Autodesk. Traducir un modelo se COBRA -- medio credito un
Revit o un IFC -- asi que las decisiones sobre cuando se paga tienen que poder
probarse sin pagar.
"""

import os

from app_logging import get_logger

logger = get_logger('publicar_al_visor')

# Lo que Autodesk sabe traducir y esta obra usa. La lista es corta a proposito:
# mandar un .docx a traducir gasta el intento, tarda, y falla.
EXTENSIONES_MODELO = {
    '.rvt', '.ifc', '.nwd', '.nwc', '.dwg', '.dxf', '.dgn', '.3dm', '.skp',
    '.fbx', '.obj', '.step', '.stp', '.iges', '.igs', '.sat', '.3ds', '.glb',
    '.gltf', '.pdf',
}
# Nubes de puntos: se traducen distinto (solo 3d) pero se publican igual.
EXTENSIONES_NUBE = {'.laz', '.las', '.e57', '.rcp', '.rcs', '.pts', '.ptx', '.xyz'}


class NoSePuedePublicar(Exception):
    """Motivo en castellano, para devolverlo tal cual a quien lo pidio."""


def extension_de(nombre):
    return os.path.splitext((nombre or '').lower())[1]


def es_publicable(nombre):
    ext = extension_de(nombre)
    return ext in EXTENSIONES_MODELO or ext in EXTENSIONES_NUBE


def comprobar_documento(fila, model_urn):
    """fila = (id, name, gcs_urn, model_urn, status, size_bytes, sha256, urn_aps).

    Devuelve el diccionario del documento o lanza NoSePuedePublicar con un motivo
    que se pueda leer. Cada negativa dice QUE hacer, no solo que no.
    """
    if not fila:
        raise NoSePuedePublicar('El documento no existe en esta obra.')
    (nid, nombre, gcs_urn, obra, estado, tam, sha, urn_aps) = fila
    if obra != model_urn:
        # No se distingue de "no existe": decirlo permitiria descubrir que
        # identificadores son validos en otras obras.
        raise NoSePuedePublicar('El documento no existe en esta obra.')
    if not gcs_urn:
        raise NoSePuedePublicar(
            'Este documento no tiene fichero asociado en el almacén. '
            'Vuelve a subirlo antes de publicarlo.')
    if not es_publicable(nombre):
        raise NoSePuedePublicar(
            'El visor no traduce «%s». Publica el modelo (.rvt, .ifc, .nwd, '
            '.dwg…), no su documentación.' % (extension_de(nombre) or nombre))
    if (estado or '').upper() == 'WIP':
        # Es la misma regla que el transmittal: un borrador no se emite. Y aqui
        # ademas costaria creditos publicar algo que su autor no da por bueno.
        raise NoSePuedePublicar(
            'Este modelo está en borrador (WIP). Compártelo o publícalo en el '
            'ECD antes de llevarlo al visor: traducir cuesta créditos y un '
            'borrador todavía va a cambiar.')
    return {'node_id': str(nid), 'nombre': nombre, 'gcs_urn': gcs_urn,
            'obra': obra, 'estado': estado, 'size_bytes': tam or 0,
            'sha256': sha, 'urn_aps': urn_aps}


def ya_publicado(doc, forzar=False):
    """El URN que ya tiene, si no hace falta volver a pagar la traduccion.

    Publicar dos veces el MISMO contenido es pagar dos veces por lo mismo. Y no
    es hipotetico: basta con que dos personas pulsen el boton, o que alguien
    recargue la pantalla.

    Se decide por la huella del contenido, no por el nombre ni por la fecha: si
    los bytes son los mismos, el derivado de Autodesk tambien lo es.
    """
    if forzar:
        return None
    return doc.get('urn_aps') or None


def clave_de_objeto(doc):
    """El nombre con el que el modelo entra en el almacen de Autodesk.

    Lleva la huella del contenido y no la hora: subir dos veces lo mismo cae en
    la misma clave en vez de dejar copias sueltas pagadas y olvidadas. Si no hay
    huella -- version anterior al sellado -- se cae al identificador del nodo,
    que al menos es estable para ese documento.
    """
    from werkzeug.utils import secure_filename
    sello = (doc.get('sha256') or doc.get('node_id') or '')[:16]
    return 'ecd_%s_%s' % (sello, secure_filename(doc['nombre']))


def es_nube_de_puntos(nombre):
    return extension_de(nombre) in EXTENSIONES_NUBE
