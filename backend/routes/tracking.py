import os
import json
import traceback
from flask import Blueprint, request, jsonify

tracking_bp = Blueprint('tracking', __name__)

# Constants
TRACKING_FILE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "tracking_data.json")

def get_tracking_data():
    """Reads the tracking JSON from local file."""
    if not os.path.exists(TRACKING_FILE_PATH):
        return {"avance": [], "fotos": []}
    try:
        with open(TRACKING_FILE_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error reading tracking data: {e}")
        return {"avance": [], "fotos": []}

def save_tracking_data(data):
    """Writes the tracking JSON to local file."""
    try:
        with open(TRACKING_FILE_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving tracking data: {e}")
        return False

@tracking_bp.route('/api/tracking', methods=['GET'])
def get_tracking():
    data = get_tracking_data()
    return jsonify(data)

@tracking_bp.route('/api/tracking', methods=['POST'])
def update_tracking():
    try:
        new_data = request.json
        if not new_data:
            return jsonify({"error": "No data provided"}), 400
        
        # Validate structure roughly
        if 'avance' not in new_data: new_data['avance'] = []
        if 'fotos' not in new_data: new_data['fotos'] = []
        
        if save_tracking_data(new_data):
            return jsonify(new_data)
        else:
            return jsonify({"error": "Failed to save"}), 500
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@tracking_bp.route('/api/tracking/photo', methods=['POST'])
def add_photo_to_pin():
    """
    Adds a photo record to a specific pin inside 'fotos' list.
    Expects JSON: { "pinId": 123, "photo": { ... } }
    """
    try:
        req = request.json
        pin_id = req.get('pinId')
        photo = req.get('photo')
        
        if not pin_id or not photo:
            return jsonify({"error": "Missing pinId or photo"}), 400

        data = get_tracking_data()
        
        # Find pin
        pin_found = False
        for pin in data.get('fotos', []):
            if str(pin.get('id')) == str(pin_id):
                if 'photos' not in pin:
                    pin['photos'] = []
                pin['photos'].append(photo)
                pin_found = True
                break
        
        if not pin_found:
            return jsonify({"error": "Pin not found"}), 404
            
        if save_tracking_data(data):
            return jsonify({"status": "success", "data": data})
        else:
            return jsonify({"error": "Failed to save"}), 500

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
