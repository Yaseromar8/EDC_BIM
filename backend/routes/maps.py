import os
import time
import json
import re
from datetime import datetime
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from aps import get_internal_token

maps_bp = Blueprint('maps', __name__)

# --- CONFIG & CONSTANTS ---
PINS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'pins.json')
LAYERS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'layers.json')

# --- HELPERS ---

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
            json.dump(pins, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving pins: {e}")

def load_layers():
    if not os.path.exists(LAYERS_FILE):
        return []
    try:
        with open(LAYERS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading layers: {e}")
        return []

def save_layers(layers):
    try:
        with open(LAYERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(layers, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving layers: {e}")

# --- ROUTES ---

@maps_bp.route('/api/pins', methods=['GET'])
def get_pins():
    return jsonify(load_pins())

@maps_bp.route('/api/pins', methods=['POST'])
def create_pin():
    data = request.json or {}
    
    has_latlng = 'lat' in data and 'lng' in data
    has_xyz = 'x' in data and 'y' in data and 'z' in data
    
    if not has_latlng and not has_xyz:
        return jsonify({'error': 'Missing coordinates (lat/lng OR x/y/z)'}), 400

    pins = load_pins()
    
    # Calculate next Point Number
    max_num = 0
    for p in pins:
        # Extract number from "Punto N"
        match = re.match(r'Punto (\d+)', p.get('name', ''))
        if match:
            num = int(match.group(1))
            if num > max_num:
                max_num = num
    
    next_num = max_num + 1
    name = f"Punto {next_num}"
    
    new_pin = {
        'id': str(int(time.time() * 1000)),
        'name': name,
        'documents': [],
        'createdAt': datetime.utcnow().isoformat() + 'Z'
    }
    
    if has_latlng:
        new_pin['lat'] = data['lat']
        new_pin['lng'] = data['lng']
        
    if has_xyz:
        new_pin['x'] = data['x']
        new_pin['y'] = data['y']
        new_pin['z'] = data['z']
    
    pins.append(new_pin)
    save_pins(pins)
    return jsonify(new_pin)

@maps_bp.route('/api/pins/<pin_id>', methods=['DELETE'])
def delete_pin(pin_id):
    pins = load_pins()
    initial_len = len(pins)
    pins = [p for p in pins if p['id'] != pin_id]
    
    if len(pins) < initial_len:
        save_pins(pins)
        return jsonify({'success': True})
    return jsonify({'error': 'Pin not found'}), 404

@maps_bp.route('/api/pins/<pin_id>', methods=['PUT'])
def update_pin(pin_id):
    data = request.json or {}
    pins = load_pins()
    
    found = False
    updated_pin = None
    
    for p in pins:
        if p['id'] == pin_id:
            # Update fields if present
            if 'documents' in data:
                p['documents'] = data['documents']
            if 'name' in data:
                p['name'] = data['name']
            found = True
            updated_pin = p
            break
            
    if found:
        save_pins(pins)
        return jsonify(updated_pin)
    return jsonify({'error': 'Pin not found'}), 404

@maps_bp.route('/api/layers', methods=['GET'])
def get_layers_route():
    return jsonify(load_layers())

@maps_bp.route('/api/layers', methods=['POST'])
def create_layer():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    layers = load_layers()
    new_layer = {
        'id': str(int(time.time() * 1000)),
        'name': data.get('name', 'Nueva Capa'),
        'url': data.get('url'),
        'visible': True,
        'created_at': datetime.utcnow().isoformat()
    }
    layers.append(new_layer)
    save_layers(layers)
    return jsonify(new_layer), 201

@maps_bp.route('/api/layers/<layer_id>', methods=['DELETE'])
def delete_layer(layer_id):
    layers = load_layers()
    layers = [l for l in layers if l['id'] != layer_id]
    save_layers(layers)
    return jsonify({'success': True})

@maps_bp.route('/api/layers/<layer_id>', methods=['PUT'])
def update_layer(layer_id):
    data = request.get_json()
    layers = load_layers()
    for layer in layers:
        if layer['id'] == layer_id:
            if 'visible' in data:
                layer['visible'] = data['visible']
            if 'name' in data:
                layer['name'] = data['name']
    save_layers(layers)
    return jsonify({'success': True})

@maps_bp.route('/api/maps/upload', methods=['POST'])
def upload_map_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if file and (file.filename.endswith('.kml') or file.filename.endswith('.kmz')):
        filename = secure_filename(file.filename)
        # Ensure directory exists safely relative to this file location
        # backend/routes/maps.py -> backend/uploads/maps
        upload_folder = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads', 'maps')
        os.makedirs(upload_folder, exist_ok=True)
        
        file_path = os.path.join(upload_folder, filename)
        file.save(file_path)
        
        # Construct URL relative to server root
        # Assuming server.py serves static files from uploads/maps at /maps/uploads/
        # Check server.py static serving if needed, but standard usually maps static folders.
        # Let's verify if server.py has a route for serving these files.
        # If not, we might need to add one or use a direct static route.
        # Standard approach: return relative URL that frontend can use.
        url = f'/maps/uploads/{filename}'
        return jsonify({'url': url})
        
    return jsonify({'error': 'Invalid file type'}), 400
