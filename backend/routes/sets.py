"""Conjuntos (Sets) de documentos por entrega/hito (estilo ACC Sets).

Un set agrupa documentos con su versión CONGELADA al momento de añadirlos:
la foto exacta de una entrega ("Entrega 30%", "Rev B"), aunque los archivos
sigan evolucionando después.
"""
import traceback
from flask import Blueprint, request, jsonify, g
from db import get_db_connection, log_activity

sets_bp = Blueprint('sets', __name__)


def ensure_sets_tables():
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''
            CREATE TABLE IF NOT EXISTS doc_sets (
                id SERIAL PRIMARY KEY,
                model_urn TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                created_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (model_urn, name)
            )''')
        cur.execute('''
            CREATE TABLE IF NOT EXISTS doc_set_items (
                set_id INTEGER NOT NULL REFERENCES doc_sets(id) ON DELETE CASCADE,
                node_id TEXT NOT NULL,
                name TEXT,
                version_number INTEGER,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (set_id, node_id)
            )''')
        # La VERSION concreta, no su numero. Con version_number solo, la etiqueta
        # «V3 congelada» era falsa: se abria por node_id y salia el contenido de
        # hoy. Las filas anteriores se quedan con NULL y siguen abriendo lo vivo
        # -no hay forma de adivinar a posteriori que habia entonces-, pero se
        # marcan como tales en la pantalla en vez de prometer un congelado.
        cur.execute('ALTER TABLE doc_set_items ADD COLUMN IF NOT EXISTS version_id TEXT')
        cur.execute('ALTER TABLE doc_set_items ADD COLUMN IF NOT EXISTS added_by TEXT')
        conn.commit()


def _user():
    return getattr(g, 'current_user', None) or {}


def _hay_acceso(model_urn):
    """¿La sesión pertenece a esta obra? Mismo criterio que usa reviews.py."""
    from routes.documents import verify_project_access
    return verify_project_access(getattr(g, 'current_user', None), model_urn)


def _obra_del_conjunto(set_id):
    """La obra de un conjunto sale del propio conjunto, nunca de la petición.

    EL AGUJERO QUE ESTO CIERRA
    --------------------------
    Cuatro de los seis endpoints reciben sólo el set_id, que es un entero
    secuencial (1, 2, 3…). Como no llevaban model_urn por ningún sitio, el
    guardia de autorización no tenía obra que comprobar y caía en su rama de
    "hueco": escribía un aviso en el registro y DEJABA PASAR, incluso con
    ENFORCE_PROJECT_AUTHZ activado. Cualquier sesión válida podía ir probando
    números y leerse -o modificar- los conjuntos de otras obras.

    Hoy no muerde porque los cinco usuarios son administradores de la única
    obra. Muerde el día que invites a alguien.
    """
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT model_urn FROM doc_sets WHERE id = %s", (set_id,))
        fila = cur.fetchone()
    return fila[0] if fila else None


def _guardia_del_conjunto(set_id):
    """Devuelve (obra, None) si se puede seguir, o (None, respuesta_de_error)."""
    obra = _obra_del_conjunto(set_id)
    if not obra:
        return None, (jsonify({"success": False, "error": "El conjunto no existe."}), 404)
    if not _hay_acceso(obra):
        return None, (jsonify({"success": False, "error": "No tienes acceso a esta obra."}), 403)
    return obra, None


@sets_bp.route('/api/sets', methods=['GET'])
def list_sets():
    model_urn = request.args.get('model_urn')
    if not model_urn:
        return jsonify({"success": False, "error": "Falta model_urn"}), 400
    if not _hay_acceso(model_urn):
        return jsonify({"success": False, "error": "No tienes acceso a esta obra."}), 403
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""SELECT s.id, s.name, s.description, s.created_by, s.created_at, COUNT(i.node_id)
                           FROM doc_sets s LEFT JOIN doc_set_items i ON i.set_id = s.id
                           WHERE s.model_urn = %s
                           GROUP BY s.id ORDER BY s.id DESC""", (model_urn,))
            sets = [{"id": r[0], "name": r[1], "description": r[2], "created_by": r[3],
                     "created_at": r[4].isoformat() if r[4] else None, "items_count": r[5]}
                    for r in cur.fetchall()]
        return jsonify({"success": True, "sets": sets})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@sets_bp.route('/api/sets', methods=['POST'])
def create_set():
    d = request.get_json() or {}
    if not d.get('model_urn') or not d.get('name'):
        return jsonify({"success": False, "error": "Faltan model_urn/name"}), 400
    if not _hay_acceso(d['model_urn']):
        return jsonify({"success": False, "error": "No tienes acceso a esta obra."}), 403
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""INSERT INTO doc_sets (model_urn, name, description, created_by)
                           VALUES (%s,%s,%s,%s) ON CONFLICT (model_urn, name) DO NOTHING RETURNING id""",
                        (d['model_urn'], d['name'].strip(), d.get('description', ''), _user().get('name')))
            row = cur.fetchone()
            conn.commit()
        if not row:
            return jsonify({"success": False, "error": "Ya existe un conjunto con ese nombre"}), 409
        log_activity(d['model_urn'], 'set_created', 'set', entity_id=str(row[0]),
                     entity_name=d['name'], performed_by=_user().get('name'))
        return jsonify({"success": True, "id": row[0]})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@sets_bp.route('/api/sets/<int:set_id>', methods=['DELETE'])
def delete_set(set_id):
    if _user().get('role') != 'admin':
        return jsonify({"success": False, "error": "Solo administradores."}), 403
    obra, negado = _guardia_del_conjunto(set_id)
    if negado:
        return negado
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM doc_sets WHERE id = %s", (set_id,))
            conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@sets_bp.route('/api/sets/<int:set_id>/items', methods=['GET'])
def get_set_items(set_id):
    obra, negado = _guardia_del_conjunto(set_id)
    if negado:
        return negado
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""SELECT node_id, name, version_number, added_at, version_id, added_by
                           FROM doc_set_items WHERE set_id = %s ORDER BY name""", (set_id,))
            items = [{"node_id": r[0], "name": r[1], "version_number": r[2],
                      "added_at": r[3].isoformat() if r[3] else None,
                      "version_id": r[4], "added_by": r[5],
                      # Sin version_id no hay congelado que valga: la pantalla
                      # tiene que decirlo en vez de prometerlo.
                      "congelado": bool(r[4])} for r in cur.fetchall()]
        return jsonify({"success": True, "items": items})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@sets_bp.route('/api/sets/<int:set_id>/items', methods=['POST'])
def add_set_items(set_id):
    d = request.get_json() or {}
    items = d.get('items') or []
    if not items:
        return jsonify({"success": False, "error": "Faltan items"}), 400
    obra, negado = _guardia_del_conjunto(set_id)
    if negado:
        return negado
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            for it in items:
                cur.execute("""INSERT INTO doc_set_items
                                 (set_id, node_id, name, version_number, version_id, added_by)
                               VALUES (%s,%s,%s,%s,%s,%s)
                               ON CONFLICT (set_id, node_id) DO UPDATE SET
                                 version_number = EXCLUDED.version_number,
                                 version_id = EXCLUDED.version_id,
                                 name = EXCLUDED.name,
                                 added_by = EXCLUDED.added_by""",
                            (set_id, it['node_id'], it.get('name'), it.get('version', 1),
                             it.get('version_id'), _user().get('name') or _user().get('email')))
            conn.commit()
        # Meter y sacar documentos de una entrega es justo lo que hay que poder
        # auditar despues; antes solo se registraba la creacion del conjunto.
        log_activity(obra, 'set_items_added', 'set', entity_id=str(set_id),
                     entity_name=f"{len(items)} documento(s)",
                     performed_by=_user().get('name'))
        return jsonify({"success": True, "added": len(items),
                        "congelados": sum(1 for it in items if it.get('version_id'))})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@sets_bp.route('/api/sets/<int:set_id>/items/<node_id>', methods=['DELETE'])
def remove_set_item(set_id, node_id):
    obra, negado = _guardia_del_conjunto(set_id)
    if negado:
        return negado
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM doc_set_items WHERE set_id = %s AND node_id = %s", (set_id, node_id))
            conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
