"""
Tableros de análisis (Dashboards) — persistencia por frente.
=============================================================
El visor arma tableros de gráficos (agrupar/contar/sumar sobre el Inventory)
y aquí se GUARDAN por frente para reusarlos. La config es un JSONB opaco para
el backend (el frontend es dueño del esquema; 'version' interna permite migrar
sin tocar la API). Mismos patrones que routes/link.py: auto-migración ligera
y política de acceso por proyecto.
"""
import json
from flask import Blueprint, request, jsonify, g

dashboards_bp = Blueprint('dashboards', __name__)

_TABLES_READY = False


def _check_project_access(project):
    """Misma política de tenant que el resto del backend (ver routes/link.py)."""
    try:
        from routes.documents import verify_project_access
        user = getattr(g, 'current_user', None)
        if user and not verify_project_access(user, project):
            return jsonify({"success": False, "error": "No tienes acceso a este proyecto."}), 403
    except Exception:
        pass  # la verificación nunca debe tumbar la funcionalidad
    return None


def _ensure_tables():
    global _TABLES_READY
    if _TABLES_READY:
        return
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS dashboards (
                id SERIAL PRIMARY KEY,
                project TEXT NOT NULL,
                name TEXT NOT NULL DEFAULT 'General',
                config JSONB NOT NULL DEFAULT '{}',
                created_by TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_dashboards_proj ON dashboards(project, id)")
        conn.commit()
    _TABLES_READY = True


def _user_id():
    try:
        u = getattr(g, 'current_user', None)
        return str(u.get('id')) if u else None
    except Exception:
        return None


@dashboards_bp.route('/api/dashboards', methods=['GET'])
def list_dashboards():
    """Lista los tableros de un frente (sin config: liviano para el selector)."""
    project = request.args.get('project')
    if not project:
        return jsonify({"success": False, "error": "project requerido"}), 400
    denied = _check_project_access(project)
    if denied:
        return denied
    _ensure_tables()
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, name, updated_at FROM dashboards WHERE project = %s ORDER BY id ASC",
            (project,)
        )
        rows = cur.fetchall()
    return jsonify({"success": True, "dashboards": [
        {"id": r[0], "name": r[1], "updated_at": r[2].isoformat() if r[2] else None} for r in rows
    ]}), 200


@dashboards_bp.route('/api/dashboards/<int:dash_id>', methods=['GET'])
def get_dashboard(dash_id):
    _ensure_tables()
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT project, name, config FROM dashboards WHERE id = %s", (dash_id,))
        row = cur.fetchone()
    if not row:
        return jsonify({"success": False, "error": "Tablero no encontrado"}), 404
    project, name, config = row
    denied = _check_project_access(project)
    if denied:
        return denied
    if not isinstance(config, dict):
        config = json.loads(config or '{}')
    return jsonify({"success": True, "id": dash_id, "project": project, "name": name, "config": config}), 200


@dashboards_bp.route('/api/dashboards', methods=['POST'])
def create_dashboard():
    data = request.get_json(silent=True) or {}
    project = data.get('project')
    if not project:
        return jsonify({"success": False, "error": "project requerido"}), 400
    denied = _check_project_access(project)
    if denied:
        return denied
    name = (data.get('name') or 'General').strip()[:120] or 'General'
    config = data.get('config')
    if not isinstance(config, dict):
        config = {}
    _ensure_tables()
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO dashboards (project, name, config, created_by) VALUES (%s, %s, %s, %s) RETURNING id",
            (project, name, json.dumps(config), _user_id())
        )
        new_id = cur.fetchone()[0]
        conn.commit()
    return jsonify({"success": True, "id": new_id}), 201


@dashboards_bp.route('/api/dashboards/<int:dash_id>', methods=['PUT'])
def update_dashboard(dash_id):
    data = request.get_json(silent=True) or {}
    _ensure_tables()
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT project FROM dashboards WHERE id = %s", (dash_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"success": False, "error": "Tablero no encontrado"}), 404
        denied = _check_project_access(row[0])
        if denied:
            return denied
        sets, params = [], []
        if isinstance(data.get('config'), dict):
            sets.append("config = %s")
            params.append(json.dumps(data['config']))
        if data.get('name'):
            sets.append("name = %s")
            params.append(str(data['name']).strip()[:120])
        if not sets:
            return jsonify({"success": False, "error": "Nada que actualizar"}), 400
        sets.append("updated_at = NOW()")
        params.append(dash_id)
        cur.execute(f"UPDATE dashboards SET {', '.join(sets)} WHERE id = %s", tuple(params))
        conn.commit()
    return jsonify({"success": True}), 200


@dashboards_bp.route('/api/dashboards/<int:dash_id>', methods=['DELETE'])
def delete_dashboard(dash_id):
    _ensure_tables()
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT project FROM dashboards WHERE id = %s", (dash_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"success": False, "error": "Tablero no encontrado"}), 404
        denied = _check_project_access(row[0])
        if denied:
            return denied
        cur.execute("DELETE FROM dashboards WHERE id = %s", (dash_id,))
        conn.commit()
    return jsonify({"success": True}), 200
