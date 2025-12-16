
import os
import json
import time
from flask import Blueprint, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename

pins_bp = Blueprint('pins', __name__)

# File to store pins data
PINS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'pins.json')
# Directory for pin attachments
PINS_UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads', 'pins')

os.makedirs(PINS_UPLOAD_FOLDER, exist_ok=True)

def load_pins():
    if not os.path.exists(PINS_FILE):
        return []
    try:
        with open(PINS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading pins: {e}")
        return []

def save_pins(pins):
    try:
        with open(PINS_FILE, 'w', encoding='utf-8') as f:
            json.dump(pins, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving pins: {e}")
        return False

# --- ROUTES ---

@pins_bp.route('/api/pins', methods=['GET'])
def get_pins():
    pins = load_pins()
    return jsonify(pins)

@pins_bp.route('/api/pins', methods=['POST'])
def create_pin():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    pins = load_pins()
    
    # Ensure ID
    if not data.get('id'):
        data['id'] = str(int(time.time() * 1000))
    
    # Add creation timestamp
    data['createdAt'] = time.time()
    
    pins.append(data)
    save_pins(pins)
    
    return jsonify(data), 201

@pins_bp.route('/api/pins/<pin_id>', methods=['PUT'])
def update_pin(pin_id):
    data = request.get_json()
    pins = load_pins()
    
    found = False
    updated_pin = None
    
    new_pins = []
    for p in pins:
        if p['id'] == pin_id:
            # Update fields
            p.update(data)
            updated_pin = p
            found = True
        new_pins.append(p)
    
    if not found:
        return jsonify({'error': 'Pin not found'}), 404
        
    save_pins(new_pins)
    return jsonify(updated_pin)

@pins_bp.route('/api/pins/<pin_id>', methods=['DELETE'])
def delete_pin(pin_id):
    pins = load_pins()
    new_pins = [p for p in pins if p['id'] != pin_id]
    
    if len(new_pins) == len(pins):
        return jsonify({'error': 'Pin not found'}), 404
        
    save_pins(new_pins)
    return jsonify({'success': True})

@pins_bp.route('/api/pins/upload', methods=['POST'])
def upload_pin_attachment():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    filename = secure_filename(f"{int(time.time())}_{file.filename}")
    file_path = os.path.join(PINS_UPLOAD_FOLDER, filename)
    file.save(file_path)
    
    # Generate public URL (assumes server.py serves /uploads/pins)
    # Use relative URL or absolute based on host
    # Ideally, returns relative path that frontend can prepend host or use directly
    url = f'/uploads/pins/{filename}'
    
    return jsonify({
        'url': url,
        'filename': file.filename,
        'type': 'local'
    })

# Route to serve uploaded pin files
@pins_bp.route('/uploads/pins/<path:filename>')
def serve_pin_file(filename):
    return send_from_directory(PINS_UPLOAD_FOLDER, filename)
