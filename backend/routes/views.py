import os
import json
import time
import traceback
from flask import Blueprint, request, jsonify
from db import get_db_connection

views_bp = Blueprint('views', __name__)

views_bp = Blueprint('views', __name__)


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


def get_views_internal(project_id=None):
    """Reads views from PostgreSQL. Falls back to local JSON if DB unavailable."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if project_id:
                cursor.execute(
                    'SELECT id, name, project_id, viewer_state, filter_state, config, created_at FROM saved_views WHERE project_id = %s ORDER BY created_at',
                    (project_id,)
                )
            else:
                cursor.execute(
                    'SELECT id, name, project_id, viewer_state, filter_state, config, created_at FROM saved_views ORDER BY created_at'
                )
            rows = cursor.fetchall()
            views = []
            for r in rows:
                views.append({
                    'id': r[0],
                    'name': r[1],
                    'projectId': r[2],
                    'viewerState': r[3] or {},
                    'filterState': r[4] or {},
                    'config': r[5] or {},
                    'createdAt': r[6].isoformat() if r[6] else None
                })
            return views
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

@views_bp.route('/api/views', methods=['GET'])
def get_views():
    project_id = request.args.get('project')
    views = get_views_internal(project_id=project_id)
    return jsonify(views)


@views_bp.route('/api/views', methods=['POST'])
def save_view():
    data = request.get_json()
    if not data or 'name' not in data or 'viewerState' not in data:
        return jsonify({'error': 'Missing name or state'}), 400

    new_view = {
        'id': str(int(time.time() * 1000)),
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
