"""
Live Link Web <-> Revit — canal de comandos por frente.
========================================================
La web publica comandos (aislar/seleccionar/limpiar) y el plugin de Revit
("ECD Link") los sondea cada ~1 s mientras el vinculo esta activo. Se usa
Postgres (no memoria) porque gunicorn corre varios workers: un comando
publicado en un worker debe poder leerse desde otro.

Identidades: los externalIds del visor SON los UniqueId de Revit (la
traduccion SVF2 los preserva), asi que el plugin resuelve directo con
Document.GetElement(uniqueId). No hay tablas de mapeo.
"""
import json
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, g

link_bp = Blueprint('link', __name__)


def _check_project_access(project):
    """Misma política de tenant que el resto del backend: si hay usuario en la
    sesión y no tiene acceso al proyecto, 403. (Con authz en log-only el
    middleware puede no poblar g.current_user — entonces pasa, como en todos
    los demás endpoints.)"""
    try:
        from routes.documents import verify_project_access
        user = getattr(g, 'current_user', None)
        if user and not verify_project_access(user, project):
            return jsonify({"success": False, "error": "No tienes acceso a este proyecto."}), 403
    except Exception:
        pass  # la verificación nunca debe tumbar el canal
    return None

_TABLES_READY = False


def _ensure_tables():
    """Auto-migracion ligera (mismo patron CREATE IF NOT EXISTS del resto del backend)."""
    global _TABLES_READY
    if _TABLES_READY:
        return
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS link_commands (
                id SERIAL PRIMARY KEY,
                project TEXT NOT NULL,
                action TEXT NOT NULL,
                payload JSONB,
                created_by TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_link_cmd_proj ON link_commands(project, id)")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS link_presence (
                project TEXT NOT NULL,
                agent TEXT NOT NULL,
                last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (project, agent)
            )
        """)
        conn.commit()
    _TABLES_READY = True


@link_bp.route('/api/link/cmd', methods=['POST'])
def publish_command():
    """La web publica un comando para el Revit vinculado a este frente."""
    data = request.get_json() or {}
    project = data.get('project')
    action = data.get('action')
    if not project or action not in ('isolate', 'select', 'clear', 'colorize', 'clearcolors', 'hide'):
        return jsonify({"success": False, "error": "project y action (isolate|select|clear|colorize|clearcolors|hide) requeridos"}), 400

    denied = _check_project_access(project)
    if denied:
        return denied

    # colorize lleva groups: [{color:'#RRGGBB', externalIds:[...]}]
    payload = {"externalIds": data.get('externalIds') or [], "groups": data.get('groups') or []}
    _ensure_tables()
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO link_commands (project, action, payload, created_by) VALUES (%s, %s, %s, %s) RETURNING id",
            (project, action, json.dumps(payload), data.get('by'))
        )
        cmd_id = cur.fetchone()[0]
        # Higiene: los comandos son efimeros — purgar los de mas de 1 hora.
        cur.execute("DELETE FROM link_commands WHERE created_at < NOW() - INTERVAL '1 hour'")
        # La web tambien marca presencia (para que Revit sepa que hay alguien).
        cur.execute("""
            INSERT INTO link_presence (project, agent, last_seen) VALUES (%s, 'web', NOW())
            ON CONFLICT (project, agent) DO UPDATE SET last_seen = NOW()
        """, (project,))
        conn.commit()
    return jsonify({"success": True, "id": cmd_id}), 200


@link_bp.route('/api/link/commands', methods=['GET'])
def poll_commands():
    """El plugin de Revit sondea comandos nuevos (y de paso marca su presencia)."""
    project = request.args.get('project')
    since = request.args.get('since', '0')
    if not project:
        return jsonify({"success": False, "error": "project requerido"}), 400
    denied = _check_project_access(project)
    if denied:
        return denied
    try:
        since_id = int(since)
    except ValueError:
        since_id = 0

    _ensure_tables()
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO link_presence (project, agent, last_seen) VALUES (%s, 'revit', NOW())
            ON CONFLICT (project, agent) DO UPDATE SET last_seen = NOW()
        """, (project,))
        cur.execute(
            "SELECT id, action, payload, created_by FROM link_commands WHERE project = %s AND id > %s ORDER BY id ASC LIMIT 50",
            (project, since_id)
        )
        rows = cur.fetchall()
        conn.commit()

    def _payload(raw):
        return raw if isinstance(raw, dict) else json.loads(raw or '{}')

    commands = [{
        "id": r[0],
        "action": r[1],
        "externalIds": _payload(r[2]).get('externalIds', []),
        "groups": _payload(r[2]).get('groups', []),
        "by": r[3],
    } for r in rows]
    last_id = commands[-1]["id"] if commands else since_id
    return jsonify({"success": True, "commands": commands, "last_id": last_id}), 200


@link_bp.route('/api/link/status', methods=['GET'])
def link_status():
    """La web consulta si hay un Revit vivo en este frente (heartbeat < 10 s)."""
    project = request.args.get('project')
    if not project:
        return jsonify({"success": False, "error": "project requerido"}), 400
    _ensure_tables()
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT agent, EXTRACT(EPOCH FROM (NOW() - last_seen)) FROM link_presence WHERE project = %s",
            (project,)
        )
        rows = cur.fetchall()
    agents = {r[0]: float(r[1]) for r in rows}
    return jsonify({
        "success": True,
        "revit_connected": agents.get('revit', 9999) < 10,
        "web_connected": agents.get('web', 9999) < 10,
    }), 200
