# -*- coding: utf-8 -*-
"""UNA CARPETA COMPARTIDA POR ENLACE PÚBLICO (17-nov-2026, docs/archivos/32).

«Compartir» deja crear un enlace público (`document_shares`) sobre una CARPETA, pero la página pública solo sabía
enseñar un archivo: `GET /api/docs/shared/<id>` buscaba el fichero de la carpeta y contestaba «El archivo físico no
existe». Visto en producción: las fichas del sustento de metrados de PQT8 (Acceso 01, Canal principal, Aportantes…)
se compartieron así, sus enlaces se pegaron en un Excel y el Excel ya se envió por correo. El dueño: «necesito
mantener los enlaces, porque ya fueron enviados por correo». Así que los MISMOS enlaces tienen que abrir.

    GET /api/docs/shared/<share_id>/contenido[?carpeta=<id>]   lo que hay en la carpeta compartida o en una de sus
                                                                subcarpetas: subcarpetas y documentos
    GET /api/docs/shared/<share_id>/archivo/<node_id>          un documento de dentro, para leerlo (URL firmada)

LO QUE CONCEDE UN ENLACE A UNA CARPETA, Y NADA MÁS:
  · leer lo que está DENTRO de esa carpeta, a cualquier profundidad, también lo que se suba después (es lo que se
    compartió); nada de fuera, aunque se conozca su id;
  · los documentos ENLAZADOS en esas carpetas desde otra (migración 48) cuentan como dentro: es lo que se ve al
    abrirlas en Docs;
  · nada borrado (papelera) ni nada bajo una carpeta borrada;
  · cada documento pasa además por la regla de salida del ECD (`sensibilidad`, canal «enlace público»), igual que
    al compartirlo suelto: lo que no puede salir se ve en la lista pero no se abre;
  · el enlace vale mientras valga: revocado o caducado, nada.

Solo LECTURA: son GET bajo `/api/docs/shared/`, que el middleware ya deja pasar sin sesión (`PUBLIC_GET_PREFIXES`).
Cada apertura de un documento queda anotada, con el id del enlace, como la del enlace a un documento suelto.
"""
import uuid as _uuid

from flask import jsonify, request

from politica import publico_en_lectura
from routes.documents import documents_bp, _anotar_acceso

PROFUNDIDAD_MAXIMA = 60


def _uuid_valido(valor):
    try:
        return str(_uuid.UUID(str(valor)))
    except (ValueError, AttributeError, TypeError):
        return None


def _no(texto, http):
    return jsonify({'success': False, 'error': texto}), http


def _la_carpeta_del_enlace(cur, share_id):
    """(datos, None) si el enlace es de una carpeta y sigue valiendo; si no, (None, respuesta)."""
    limpio = _uuid_valido(share_id)
    if not limpio:
        return None, _no('Enlace inválido o expirado', 404)
    cur.execute("""SELECT s.role, s.access_type, s.expires_at, s.revoked, f.id::text, f.name, f.node_type,
                          f.is_deleted, f.model_urn
                     FROM document_shares s JOIN file_nodes f ON s.file_node_id = f.id
                    WHERE s.id = %s""", (limpio,))
    fila = cur.fetchone()
    if not fila:
        return None, _no('Enlace inválido o expirado', 404)
    role, access_type, expires_at, revoked, carpeta, nombre, tipo, borrada, model_urn = fila
    if revoked:
        return None, _no('Este enlace fue revocado.', 410)
    if expires_at:
        from datetime import datetime, timezone
        if datetime.now(timezone.utc) > expires_at:
            return None, _no('Este enlace expiró.', 410)
    if tipo != 'FOLDER':
        return None, _no('Este enlace no es de una carpeta.', 404)
    if borrada:
        return None, _no('Esta carpeta ya no está disponible.', 404)
    return {'share_id': limpio, 'role': role, 'access_type': access_type, 'carpeta': carpeta,
            'nombre': nombre, 'model_urn': model_urn}, None


def _camino_hasta(cur, raiz, nodo, model_urn):
    """Las carpetas desde `raiz` (incluida) hasta `nodo` (incluido), [{id, name}], si `nodo` está DENTRO de `raiz`,
    es de la misma obra y nada en el camino está borrado. Si no, None."""
    cur.execute("""WITH RECURSIVE sube AS (
                       SELECT id, parent_id, name, is_deleted, model_urn, 0 AS n
                         FROM file_nodes WHERE id = %(nodo)s
                       UNION ALL
                       SELECT p.id, p.parent_id, p.name, p.is_deleted, p.model_urn, s.n + 1
                         FROM file_nodes p JOIN sube s ON p.id = s.parent_id
                        WHERE s.n < %(tope)s AND s.id <> %(raiz)s
                   )
                   SELECT id::text, name, is_deleted, model_urn FROM sube ORDER BY n DESC""",
                {'nodo': nodo, 'raiz': raiz, 'tope': PROFUNDIDAD_MAXIMA})
    filas = cur.fetchall() or []
    if not filas or filas[0][0] != raiz:
        return None
    if any(borrado or urn != model_urn for _id, _n, borrado, urn in filas):
        return None
    return [{'id': i, 'name': n} for i, n, _b, _u in filas]


def _puede_salir(cur, node_id, model_urn):
    """La regla de salida del ECD para un enlace público. Si no se puede evaluar, no sale (fail-closed)."""
    try:
        import sensibilidad
        permitido, _nivel, motivo = sensibilidad.puede_salir_del_ecd(cur, node_id, model_urn)
        return bool(permitido), (motivo or '')
    except Exception as e:
        print('[carpeta-compartida] regla de salida sin evaluar: %s' % e)
        return False, 'No se pudo comprobar si este documento puede salir de la plataforma.'


def _limpia(nombre):
    return str(nombre or '').rstrip('/')


@documents_bp.route('/api/docs/shared/<share_id>/contenido', methods=['GET'])
@publico_en_lectura(motivo='contenido de una carpeta compartida por enlace publico: el permiso lo da el propio enlace (vigente y no revocado) y solo alcanza a lo que esta dentro de esa carpeta')
def contenido_de_carpeta_compartida(share_id):
    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            cur = conn.cursor()
            datos, negativa = _la_carpeta_del_enlace(cur, share_id)
            if negativa:
                return negativa
            raiz, model_urn = datos['carpeta'], datos['model_urn']
            pedida = request.args.get('carpeta')
            carpeta = _uuid_valido(pedida) if pedida else raiz
            camino = _camino_hasta(cur, raiz, carpeta, model_urn) if carpeta else None
            if not camino:
                return _no('Esa carpeta no está dentro de lo que se compartió.', 404)

            cur.execute("""SELECT id::text, name, node_type, size_bytes, mime_type, version_number, updated_at
                             FROM file_nodes
                            WHERE parent_id = %s AND model_urn = %s AND is_deleted = FALSE
                            ORDER BY node_type DESC, name ASC""", (carpeta, model_urn))
            hijos = cur.fetchall() or []
            # Los documentos ENLAZADOS aquí desde otra carpeta (migración 48): en Docs se ven dentro, así que aquí también.
            enlazados = []
            try:
                cur.execute('SAVEPOINT enlazados_de_la_carpeta')
                cur.execute("""SELECT f.id::text, f.name, f.node_type, f.size_bytes, f.mime_type, f.version_number,
                                      f.updated_at
                                 FROM doc_enlaces e JOIN file_nodes f ON f.id = e.documento_id
                                WHERE e.carpeta_id = %s AND e.model_urn = %s AND f.is_deleted = FALSE
                                  AND f.node_type = 'FILE'
                                ORDER BY f.name ASC""", (carpeta, model_urn))
                enlazados = cur.fetchall() or []
                cur.execute('RELEASE SAVEPOINT enlazados_de_la_carpeta')
            except Exception as e:
                cur.execute('ROLLBACK TO SAVEPOINT enlazados_de_la_carpeta')
                print('[carpeta-compartida] enlazados sin leer: %s' % e)

            carpetas, archivos, vistos = [], [], set()
            for fila in list(hijos) + list(enlazados):
                nid, nombre, tipo, tam, mime, version, cuando = fila
                if nid in vistos:
                    continue
                vistos.add(nid)
                if tipo == 'FOLDER':
                    carpetas.append({'id': nid, 'name': _limpia(nombre)})
                    continue
                sale, motivo = _puede_salir(cur, nid, model_urn)
                archivos.append({'id': nid, 'name': nombre, 'size': tam, 'mime_type': mime, 'version': version,
                                 'updated_at': cuando.isoformat() if hasattr(cuando, 'isoformat') else cuando,
                                 'disponible': sale, 'motivo': '' if sale else motivo})
            archivos.sort(key=lambda a: str(a['name']).lower())
        return jsonify({'success': True, 'data': {
            'compartida': {'id': raiz, 'name': _limpia(datos['nombre'])},
            'carpeta': {'id': carpeta, 'name': _limpia(camino[-1]['name'])},
            'migas': [{'id': c['id'], 'name': _limpia(c['name'])} for c in camino],
            'carpetas': carpetas, 'archivos': archivos, 'role': datos['role']}}), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return _no('No se pudo abrir la carpeta.', 500)


@documents_bp.route('/api/docs/shared/<share_id>/archivo/<node_id>', methods=['GET'])
@publico_en_lectura(motivo='un documento de una carpeta compartida por enlace publico: comprueba que el enlace vale, que el documento esta dentro de esa carpeta y la regla de salida del ECD; entrega una URL firmada de lectura')
def archivo_de_carpeta_compartida(share_id, node_id):
    try:
        from db import get_db_connection
        from gcs_manager import generate_signed_url
        with get_db_connection() as conn:
            cur = conn.cursor()
            datos, negativa = _la_carpeta_del_enlace(cur, share_id)
            if negativa:
                return negativa
            raiz, model_urn = datos['carpeta'], datos['model_urn']
            nodo = _uuid_valido(node_id)
            if not nodo:
                return _no('Ese documento no está dentro de lo que se compartió.', 404)
            cur.execute("""SELECT name, node_type, gcs_urn, size_bytes, mime_type, parent_id::text, is_deleted,
                                  model_urn
                             FROM file_nodes WHERE id = %s""", (nodo,))
            fila = cur.fetchone()
            if not fila or fila[1] != 'FILE' or fila[6] or fila[7] != model_urn:
                return _no('Ese documento no está dentro de lo que se compartió.', 404)
            nombre, _tipo, gcs_urn, tam, mime, padre, _b, _u = fila

            dentro = bool(padre) and _camino_hasta(cur, raiz, padre, model_urn) is not None
            if not dentro:
                # ¿Está ENLAZADO en una carpeta de dentro? (migración 48)
                try:
                    cur.execute('SAVEPOINT enlaces_del_documento')
                    cur.execute('SELECT carpeta_id::text FROM doc_enlaces WHERE documento_id = %s AND model_urn = %s',
                                (nodo, model_urn))
                    carpetas = [f[0] for f in cur.fetchall() or []]
                    cur.execute('RELEASE SAVEPOINT enlaces_del_documento')
                except Exception:
                    cur.execute('ROLLBACK TO SAVEPOINT enlaces_del_documento')
                    carpetas = []
                dentro = any(_camino_hasta(cur, raiz, c, model_urn) is not None for c in carpetas)
            if not dentro:
                return _no('Ese documento no está dentro de lo que se compartió.', 404)

            sale, motivo = _puede_salir(cur, nodo, model_urn)
            if not sale:
                return jsonify({'success': False, 'error': motivo or 'Este documento no puede salir de la plataforma.',
                                'code': 'SENSIBILIDAD_NO_PERMITE_SALIDA'}), 403
            if not gcs_urn:
                return _no('El archivo físico no existe', 404)
        _anotar_acceso(None, None, 'enlace público %s (carpeta)' % datos['share_id'], gcs_urn, None,
                       discriminante=datos['share_id'])
        return jsonify({'success': True, 'data': {
            'name': nombre, 'url': generate_signed_url(gcs_urn), 'role': datos['role'],
            'access_type': datos['access_type'], 'size': tam, 'mime_type': mime}}), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return _no('No se pudo abrir el documento.', 500)
