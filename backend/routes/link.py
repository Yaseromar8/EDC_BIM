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
from esquema_congelado import solo_con_ddl
import json
import logging
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, g

logger = logging.getLogger(__name__)

link_bp = Blueprint('link', __name__)


def _check_project_access(project):
    """Misma política de tenant que el resto del backend: si hay usuario en la
    sesión y no tiene acceso al proyecto, 403. (Con authz en log-only el
    middleware puede no poblar g.current_user — entonces pasa, como en todos
    los demás endpoints.)"""
    try:
        from routes.documents import verify_project_access
        user = getattr(g, 'current_user', None)
        if not verify_project_access(user, project):
            return jsonify({"success": False, "error": "No tienes acceso a este proyecto."}), 403
    except Exception as e:
        # Fail-CLOSED, igual que en dashboards.py. Antes un fallo dentro de la
        # comprobacion dejaba pasar; el canal con Revit no vale una puerta abierta.
        logger.error(f"authz link: no se pudo comprobar el acceso a {project}: {e}")
        return jsonify({"success": False, "error": "No se pudo verificar el acceso."}), 403
    return None

_TABLES_READY = False


@solo_con_ddl
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
        # Canal INVERSO Revit→web: Revit reporta su estado (selección actual,
        # tablas de planificación/metrados) y la web lo sondea. Una fila por
        # (frente, tipo); 'version' se incrementa en cada actualización para que
        # la web detecte cambios sin re-aplicar lo mismo.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS link_reports (
                project TEXT NOT NULL,
                kind TEXT NOT NULL,
                payload JSONB,
                version BIGINT NOT NULL DEFAULT 1,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (project, kind)
            )
        """)
        # Auto-detección de frente: guardamos QUÉ usuario tiene presencia web en
        # cada frente para que el plugin de Revit descubra solo el frente abierto.
        cur.execute("ALTER TABLE link_presence ADD COLUMN IF NOT EXISTS user_id TEXT")
        conn.commit()
    _TABLES_READY = True


@link_bp.route('/api/link/cmd', methods=['POST'])
def publish_command():
    """La web publica un comando para el Revit vinculado a este frente."""
    data = request.get_json() or {}
    project = data.get('project')
    action = data.get('action')
    _ALLOWED = ('isolate', 'select', 'clear', 'colorize', 'clearcolors', 'hide', 'export-schedules')
    if not project or action not in _ALLOWED:
        return jsonify({"success": False, "error": "project y action (" + "|".join(_ALLOWED) + ") requeridos"}), 400

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


# ── Auto-detección de frente (el plugin descubre el frente abierto en el web) ─

def _current_user_id():
    try:
        u = getattr(g, 'current_user', None)
        return u.get('id') if u else None
    except Exception:
        return None


@link_bp.route('/api/link/web-presence', methods=['POST'])
def web_presence():
    """El visor late su frente activo para que Revit lo auto-detecte. Se llama
    mientras haya un frente abierto en el web, aunque el vínculo no esté activo."""
    data = request.get_json(silent=True) or {}
    project = data.get('project')
    if not project:
        return jsonify({"success": False, "error": "project requerido"}), 400
    denied = _check_project_access(project)
    if denied:
        return denied
    _ensure_tables()
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO link_presence (project, agent, user_id, last_seen) VALUES (%s, 'web', %s, NOW())
            ON CONFLICT (project, agent) DO UPDATE SET last_seen = NOW(), user_id = EXCLUDED.user_id
        """, (project, _current_user_id()))
        conn.commit()
    return jsonify({"success": True}), 200


@link_bp.route('/api/link/active-frentes', methods=['GET'])
def active_frentes():
    """Frentes donde este usuario tiene el visor abierto (heartbeat < 15 s). El
    plugin llama esto para engancharse solo al frente abierto, sin escribirlo."""
    _ensure_tables()
    uid = _current_user_id()
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        if uid:
            cur.execute("""
                SELECT project FROM link_presence
                WHERE agent = 'web' AND last_seen > NOW() - INTERVAL '15 seconds'
                  AND (user_id = %s OR user_id IS NULL)
                ORDER BY last_seen DESC
            """, (uid,))
        else:
            cur.execute("""
                SELECT project FROM link_presence
                WHERE agent = 'web' AND last_seen > NOW() - INTERVAL '15 seconds'
                ORDER BY last_seen DESC
            """)
        rows = cur.fetchall()
    frentes = [r[0] for r in rows]
    return jsonify({"success": True, "frentes": frentes, "active": frentes[0] if frentes else None}), 200


# ── Canal INVERSO Revit → web ────────────────────────────────────────────────

@link_bp.route('/api/link/report', methods=['POST'])
def publish_report():
    """El plugin de Revit reporta su estado hacia la web.

    kind='selection'  → payload {externalIds:[UniqueId,...]}  (selección inversa)
    kind='schedules'  → payload {schedules:[{name,columns,rows}]}  (metrados)
    """
    data = request.get_json(silent=True) or {}
    project = data.get('project')
    kind = data.get('kind')
    if not project or kind not in ('selection', 'schedules'):
        return jsonify({"success": False, "error": "project y kind (selection|schedules) requeridos"}), 400

    denied = _check_project_access(project)
    if denied:
        return denied

    payload = data.get('payload')
    if not isinstance(payload, dict):
        payload = {}

    _ensure_tables()
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO link_reports (project, kind, payload, version, updated_at)
            VALUES (%s, %s, %s, 1, NOW())
            ON CONFLICT (project, kind)
            DO UPDATE SET payload = EXCLUDED.payload,
                          version = link_reports.version + 1,
                          updated_at = NOW()
            RETURNING version
        """, (project, kind, json.dumps(payload)))
        version = cur.fetchone()[0]
        # Reportar es actividad de Revit: mantiene vivo el heartbeat.
        cur.execute("""
            INSERT INTO link_presence (project, agent, last_seen) VALUES (%s, 'revit', NOW())
            ON CONFLICT (project, agent) DO UPDATE SET last_seen = NOW()
        """, (project,))
        conn.commit()
    return jsonify({"success": True, "version": version}), 200


@link_bp.route('/api/link/report', methods=['GET'])
def read_report():
    """La web lee el último estado reportado por Revit para este frente.

    Si se pasa ?since_version=N y no hay novedad, devuelve changed=False (payload
    omitido) para que el polling de la selección sea barato.
    """
    project = request.args.get('project')
    kind = request.args.get('kind')
    if not project or kind not in ('selection', 'schedules'):
        return jsonify({"success": False, "error": "project y kind (selection|schedules) requeridos"}), 400

    try:
        since_version = int(request.args.get('since_version', '0'))
    except ValueError:
        since_version = 0

    _ensure_tables()
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT payload, version, EXTRACT(EPOCH FROM updated_at) FROM link_reports WHERE project = %s AND kind = %s",
            (project, kind)
        )
        row = cur.fetchone()

    if not row:
        return jsonify({"success": True, "version": 0, "changed": False, "payload": None}), 200

    payload, version, updated_epoch = row
    if not isinstance(payload, dict):
        payload = json.loads(payload or '{}')
    changed = version > since_version
    return jsonify({
        "success": True,
        "version": version,
        "changed": changed,
        "updated_at": updated_epoch,
        "payload": payload if changed else None,
    }), 200
