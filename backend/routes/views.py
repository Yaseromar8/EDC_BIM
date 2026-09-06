"""Las rutas de las Saved Views.

QUE FORMA TIENE CADA RESPUESTA --y por que no es una sola-- esta en
`vistas_contrato.py`. Aqui solo se decide QUE consulta se hace y QUIEN mira.
"""
from esquema_congelado import solo_con_ddl
import os
import json
import secrets
import time
import traceback
from flask import Blueprint, request, jsonify, g
from politica import publico_en_lectura
from db import get_db_connection
import vistas_contrato as contrato

views_bp = Blueprint('views', __name__)


@solo_con_ddl
def ensure_saved_views_table():
    """Creates the saved_views table in PostgreSQL if it doesn't exist."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS saved_views (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    project_id TEXT,
                    viewer_state JSONB,
                    filter_state JSONB,
                    config JSONB,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            ''')
            conn.commit()
            print("[views] Table saved_views ready.")
    except Exception as e:
        print(f"[views] Error creating saved_views table: {e}")


try:
    ensure_saved_views_table()
except Exception:
    pass



def leer_fila(view_id):
    """La fila entera de una vista, como diccionario por nombre de columna.

    Devuelve el DATO EN BRUTO, sin decidir que se ensena: eso depende de quien
    pregunta y lo resuelve `vistas_contrato`. Separarlo evita el error de tener
    una funcion que «lee una vista» y acaba siendo tambien la que decide que
    campos son publicos.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT %s FROM saved_views WHERE id = %%s" % contrato.SQL_DETALLE,
                (view_id,)
            )
            r = cursor.fetchone()
            return dict(zip(contrato.COLUMNAS_DETALLE, r)) if r else None
    except Exception as e:
        print(f"[views] DB read by id failed: {e}")
        return None


def get_view_by_id(view_id):
    """Compatibilidad: la forma de detalle, para quien ya la usaba.

    Un unico llamador fuera de aqui --`_obra_de_la_vista` en server.py, que solo
    mira `projectId` para acotar el inventario de un enlace compartido--.
    """
    fila = leer_fila(view_id)
    return contrato.fila_de_detalle(fila) if fila else None


def listar_vistas(project_id=None):
    """EL LISTADO. Metadatos y nada mas.

    La consulta NO NOMBRA `viewer_state`, `filter_state`, `config` ni `state`.
    No es que se filtren despues: es que no salen de la base. Medido en la base
    de trabajo: 14 vistas cuyos documentos suman 74.526 bytes que el panel no
    llega a mirar --pinta `id` y `name`, ViewsPanel.jsx:163-165--.

    El orden se mantiene en `created_at` ascendente, el de siempre: esta etapa
    trata del PESO de la respuesta, no de su orden. Reordenar la galeria cuando
    una vista todavia no se puede actualizar no significaria nada.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if project_id:
                cursor.execute(
                    "SELECT %s FROM saved_views WHERE project_id = %%s ORDER BY created_at" % contrato.SQL_LISTADO,
                    (project_id,)
                )
            else:
                cursor.execute(
                    "SELECT %s FROM saved_views ORDER BY created_at" % contrato.SQL_LISTADO
                )
            return [dict(zip(contrato.COLUMNAS_LISTADO, r)) for r in cursor.fetchall()]
    except Exception as e:
        print(f"[views] DB read failed: {e}")
        return []


def save_view_to_db(view):
    """Inserts a single view into PostgreSQL."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO saved_views (id, name, project_id, viewer_state, filter_state, config, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    viewer_state = EXCLUDED.viewer_state,
                    filter_state = EXCLUDED.filter_state,
                    config = EXCLUDED.config
            ''', (
                view['id'], view['name'], view.get('projectId'),
                json.dumps(view.get('viewerState', {})),
                json.dumps(view.get('filterState', {})),
                json.dumps(view.get('config', {}))
            ))
            conn.commit()
            return True
    except Exception as e:
        print(f"[views] DB save failed: {e}")
        return False


def delete_view_from_db(view_id):
    """Deletes a view from PostgreSQL by ID."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM saved_views WHERE id = %s', (view_id,))
            conn.commit()
    except Exception as e:
        print(f"[views] DB delete failed: {e}")


# --- API Routes ---


@views_bp.route("/api/views/<view_id>", methods=["GET"])
@publico_en_lectura(motivo='es el enlace de vista compartida: quien lo abre es un tercero sin sesion')
def get_view(view_id):
    """EL DETALLE. La misma ruta sirve a dos lectores muy distintos.

    CON SESION  -> el documento entero mas sus metadatos.
    SIN SESION  -> un enlace compartido: lo justo para restaurar, y ni un dato
                   de persona. La forma v1 es exactamente la de antes de esta
                   etapa mas `schemaVersion`, para que los enlaces ya repartidos
                   sigan abriendo igual.

    Quien mira se sabe SIEMPRE, tambien en las rutas publicas: el middleware
    resuelve la identidad antes de decidir si la exige (auth_middleware.py, «se
    resuelve SIEMPRE que venga un token, incluso en rutas publicas»).
    """
    fila = leer_fila(view_id)
    if not fila:
        return jsonify({"error": "View not found"}), 404
    usuario = getattr(g, 'current_user', None)
    if usuario:
        return jsonify(contrato.fila_de_detalle(fila, usuario))
    return jsonify(contrato.fila_publica(fila))


@views_bp.route('/api/views', methods=['GET'])
def get_views():
    """EL LISTADO. Exige sesion, y no por un decorador: el middleware solo abre
    el prefijo `/api/views/` --con barra-- para los enlaces compartidos, y esta
    ruta es `/api/views`."""
    project_id = request.args.get('project')
    usuario = getattr(g, 'current_user', None)
    return jsonify([contrato.fila_de_listado(f, usuario) for f in listar_vistas(project_id)])


@views_bp.route('/api/views', methods=['POST'])
def save_view():
    data = request.get_json()
    if not data or 'name' not in data or 'viewerState' not in data:
        return jsonify({'error': 'Missing name or state'}), 400

    new_view = {
        # El identificador ES la credencial: GET /api/views/<id> es publico, asi
        # que quien acierte el numero ve la vista. Antes era la hora en
        # milisegundos -- 13 cifras derivadas del reloj -- de modo que quien
        # supiera aproximadamente cuando se creo recorria un rango estrecho hasta
        # dar con ella. Comprobado: un anonimo, sin cabecera ninguna, sacaba el
        # nombre, la obra y el estado de camara de una vista ajena.
        'id': secrets.token_urlsafe(24),
        'name': data['name'],
        'viewerState': data['viewerState'],
        'filterState': data.get('filterState', {}),
        'config': data.get('config', {}),
        'createdAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'projectId': data.get('project')
    }

    db_ok = save_view_to_db(new_view)

    if db_ok:
        return jsonify(new_view)
    else:
        return jsonify({'error': 'Failed to save view to database'}), 500


@views_bp.route('/api/views/<view_id>', methods=['DELETE'])
def delete_view(view_id):
    delete_view_from_db(view_id)
    return jsonify({'success': True})
