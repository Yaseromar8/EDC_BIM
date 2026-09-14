# -*- coding: utf-8 -*-
"""ARCHIVOS · DÓNDE ESTÁ HOY LO QUE NOMBRA UN ENLACE INTERNO.

EL ENLACE (docs/archivos/01_ENLACES_POR_CARPETA_Y_DOCUMENTO.md)
----------------------------------------------------------------
    /?obra=<obra>                                      la obra, en su carpeta raíz
    /?obra=<obra>&carpeta=<carpeta>                    una carpeta
    /?obra=<obra>&carpeta=<carpeta>&documento=<doc>    un documento, en su versión vigente
    ...&documento=<doc>&version=<versión>              una versión fija de ese documento

Identificadores, nunca nombres: renombrar o mover no rompe el enlace. Es el mismo
modelo que ACC (`folderUrn` + `entityId`).

UN ENLACE NO CONCEDE NADA
-------------------------
Se valida siempre usuario -> obra -> recurso -> permiso y, para una versión, además
versión -> documento. La obra la comprueba la ruta (`verify_project_access`) antes de
llamar aquí; el permiso es `permiso_documental.permiso_efectivo`, la misma regla que
decide el listado, la vista previa y la descarga.

LA CARPETA DA CONTEXTO; EL DOCUMENTO DA IDENTIDAD
-------------------------------------------------
Con `documento`, la `carpeta` de la dirección no decide nada: manda dónde está hoy el
documento. Si se movió de A a C se devuelve C, y la pantalla corrige la dirección. Un
documento nunca se abre dentro de una carpeta solo porque la dirección lo diga.

RESPUESTA NEUTRA
----------------
Inexistente, de otra obra, en la papelera, oculto o sin permiso: todo es
`NoDisponible`, y la ruta responde lo mismo en todos los casos, sin nombre ni
ubicación. El motivo viaja en la excepción para el registro y las pruebas; nunca sale
al cliente.
"""
import os
import uuid

MENSAJE_NO_DISPONIBLE = 'No tienes acceso a ese elemento o ya no existe.'
CODIGO_NO_DISPONIBLE = 'ENLACE_NO_DISPONIBLE'

# El mismo tope con el que `permiso_documental` sube por las carpetas: una cadena más
# larga es un ciclo o un dato roto, y no se sigue.
_MAX_SALTOS = 40

_CLAVES = ('id', 'parent_id', 'name', 'node_type', 'folder_type', 'model_urn',
           'is_deleted', 'status')


class NoDisponible(Exception):
    """El enlace no se abre. `motivo` es para el registro y las pruebas, no para el cliente."""

    def __init__(self, motivo):
        super().__init__(motivo)
        self.motivo = motivo


def _identificador(valor, que):
    """El id tal como lo guarda la base, o None si no viene. Mal formado no abre nada,
    y no llega a consultarse."""
    if valor in (None, ''):
        return None
    try:
        return str(uuid.UUID(str(valor).strip()))
    except (ValueError, TypeError, AttributeError):
        raise NoDisponible('%s mal formado' % que)


def cadena(cur, nodo_id):
    """El nodo y sus carpetas hasta arriba, empezando por el propio nodo."""
    cur.execute("""
        WITH RECURSIVE cadena AS (
            SELECT id, parent_id, name, node_type, folder_type, model_urn, is_deleted,
                   status, 0 AS salto
              FROM file_nodes
             WHERE id::text = %s
            UNION ALL
            SELECT p.id, p.parent_id, p.name, p.node_type, p.folder_type, p.model_urn,
                   p.is_deleted, p.status, c.salto + 1
              FROM file_nodes p
              JOIN cadena c ON p.id = c.parent_id
             WHERE c.salto < %s
        )
        SELECT id::text, parent_id::text, name, node_type, folder_type, model_urn,
               is_deleted, status
          FROM cadena
         ORDER BY salto""", (nodo_id, _MAX_SALTOS))
    return [dict(zip(_CLAVES, fila)) for fila in cur.fetchall()]


def _oculto_por_iso(cur, usuario, model_urn, estado):
    """La regla de `file_system_db.list_contents`: con STRICT_ISO_VISIBILITY, quien no
    administra la obra no ve lo que no está Compartido, Publicado o Archivado. Un enlace
    no puede enseñar lo que el listado esconde."""
    if os.getenv('STRICT_ISO_VISIBILITY', 'false').lower() not in ('true', '1', 'yes'):
        return False
    import estados_ecd as ecd
    try:
        from administracion_de_obra import es_admin_de_obra
        if es_admin_de_obra(cur, usuario, model_urn):
            return False
    except Exception:
        pass                                   # FAIL-CLOSED, como el listado
    return ecd.normalizar(estado) not in {ecd.SHARED, ecd.PUBLISHED, ecd.ARCHIVED}


def ubicar(cur, usuario, model_urn, carpeta=None, documento=None, version=None,
           puede_descargar=None):
    """Dónde está hoy lo que nombra el enlace, si quien pregunta puede verlo.

    Devuelve `{'carpeta', 'ruta', 'documento', 'version'}`:
      carpeta    id de la carpeta que hay que abrir; None si es la raíz de la obra
      ruta       [{'id', 'name'}] de arriba abajo, sin la raíz: con ella la pantalla
                 compone la ruta que ya usa el explorador
      documento  id del documento, o None
      version    la versión pedida con los mismos campos que `/api/docs/versions`, y
                 su clave de almacenamiento solo si `puede_descargar(documento)`; o None

    Cualquier otro caso lanza `NoDisponible`.
    """
    carpeta = _identificador(carpeta, 'carpeta')
    documento = _identificador(documento, 'documento')
    version = _identificador(version, 'version')
    if version and not documento:
        raise NoDisponible('version sin documento')
    objetivo = documento or carpeta
    if not objetivo:
        raise NoDisponible('enlace sin carpeta ni documento')

    # 1 · EL RECURSO, DENTRO DE ESTA OBRA, fuera de la papelera y con toda su cadena.
    filas = cadena(cur, objetivo)
    if not filas:
        raise NoDisponible('no existe')
    if any(f['model_urn'] != model_urn for f in filas):
        raise NoDisponible('de otra obra')
    # `is not False`: el listado pide `is_deleted = FALSE`, así que un nulo tampoco se ve.
    if any(f['is_deleted'] is not False for f in filas):
        raise NoDisponible('en la papelera')
    if filas[-1]['parent_id'] is not None:
        raise NoDisponible('cadena de carpetas rota o demasiado larga')
    nodo = filas[0]
    if nodo['node_type'] != ('FILE' if documento else 'FOLDER'):
        raise NoDisponible('no es del tipo que dice el enlace')
    carpetas = filas[1:] if documento else filas
    if any(f['node_type'] != 'FOLDER' for f in carpetas):
        raise NoDisponible('cadena de carpetas rota')

    # 2 · EL PERMISO EFECTIVO. La raíz de la obra es el enlace de la obra: la ve todo
    # miembro, como en el explorador. Un documento lleva el permiso de su carpeta.
    if documento or nodo['folder_type'] != 'PROJECT_ROOT':
        import permiso_documental as pd
        from folder_permissions import PERMISSION_LEVELS
        nivel = pd.permiso_efectivo(cur, usuario, model_urn, objetivo)
        if PERMISSION_LEVELS.get(nivel, -1) < PERMISSION_LEVELS['viewer']:
            raise NoDisponible('sin permiso')
    if documento and _oculto_por_iso(cur, usuario, model_urn, nodo['status']):
        raise NoDisponible('oculto por el modo ISO estricto')

    # 3 · LA VERSIÓN, DE ESTE DOCUMENTO, antes de devolver nada.
    datos_version = None
    if version:
        cur.execute("SELECT 1 FROM file_versions WHERE id::text = %s AND file_node_id::text = %s",
                    (version, documento))
        if not cur.fetchone():
            raise NoDisponible('la version no es de este documento')
        from file_system_db import get_file_versions
        datos_version = next((v for v in get_file_versions(model_urn, documento)
                              if str(v.get('id')) == version), None)
        if datos_version is None:
            raise NoDisponible('la version no se pudo leer')
        if puede_descargar is None or not puede_descargar(documento):
            datos_version = {k: v for k, v in datos_version.items() if k != 'gcs_urn'}

    visibles = [f for f in carpetas if f['folder_type'] != 'PROJECT_ROOT']
    en_la_raiz = not carpetas or carpetas[0]['folder_type'] == 'PROJECT_ROOT'
    return {
        'carpeta': None if en_la_raiz else carpetas[0]['id'],
        'ruta': [{'id': f['id'], 'name': f['name']} for f in reversed(visibles)],
        'documento': documento,
        'version': datos_version,
    }
