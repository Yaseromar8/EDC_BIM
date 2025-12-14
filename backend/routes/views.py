import os
import json
import time
from flask import Blueprint, request, jsonify

views_bp = Blueprint('views', __name__)

# Constants
VIEWS_FILE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "saved_views.json")

def get_views_internal():
    """Reads views from local JSON file."""
    if not os.path.exists(VIEWS_FILE_PATH):
        return []
    try:
        with open(VIEWS_FILE_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error reading views: {e}")
        return []

def save_views_internal(views_list):
    """Writes views list to local JSON file."""
    try:
        with open(VIEWS_FILE_PATH, 'w', encoding='utf-8') as f:
            json.dump(views_list, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving views: {e}")
        return False

@views_bp.route('/api/views', methods=['GET'])
def get_views():
    views = get_views_internal()
    return jsonify(views)

@views_bp.route('/api/views', methods=['POST'])
def save_view():
    data = request.get_json()
    if not data or 'name' not in data or 'viewerState' not in data:
        return jsonify({'error': 'Missing name or state'}), 400
    
    views = get_views_internal()
    
    new_view = {
        'id': str(int(time.time() * 1000)),
        'name': data['name'],
        'viewerState': data['viewerState'],
        'filterState': data.get('filterState', {}), # Custom React state (filters, colors)
        'config': data.get('config', {}),          # Other config if needed
        'createdAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    }
    
    views.append(new_view)
    if save_views_internal(views):
        return jsonify(new_view)
    else:
        return jsonify({'error': 'Failed to save view'}), 500

@views_bp.route('/api/views/<view_id>', methods=['DELETE'])
def delete_view(view_id):
    views = get_views_internal()
    original_len = len(views)
    views = [v for v in views if v['id'] != view_id]
    
    if len(views) < original_len:
        save_views_internal(views)
        
    return jsonify({'success': True, 'remaining': len(views)})
