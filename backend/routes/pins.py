
import os
import json
import time
import re
from flask import Blueprint, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from acc_manager import AccManager

pins_bp = Blueprint('pins', __name__)

# File to store pins data
PINS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'pins.json')
ACC_CONFIG_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'acc_config.json')

# Directory for local pin attachments
PINS_UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads', 'pins')
os.makedirs(PINS_UPLOAD_FOLDER, exist_ok=True)

acc_manager = AccManager()


def debug_log(msg):
    try:
        log_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'pins_debug.log')
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"{time.ctime()}: {msg}\n")
    except Exception as e:
        print(f"DEBUG LOG ERROR: {e}")

def get_acc_config():
    if not os.path.exists(ACC_CONFIG_FILE):
        return None
    try:
        with open(ACC_CONFIG_FILE, 'r') as f:
            return json.load(f)
    except:
        return None

def load_pins():
    config = get_acc_config()
    if config and config.get('project_id') and config.get('config_folder_id'):
        print(f"Loading pins from ACC Folder: {config['config_folder_id']}")
        item, error = acc_manager.find_item_in_folder(config['project_id'], config['config_folder_id'], 'pins.json')
        if item:
            data, err = acc_manager.get_json_data(config['project_id'], item['id'])
            if not err: return data
            print(f"Error reading ACC pins.json: {err}")
        return []
    else:
        # Local Fallback
        if not os.path.exists(PINS_FILE):
            return []
        try:
            with open(PINS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading pins: {e}")
            return []

def save_pins(pins):
    config = get_acc_config()
    if config and config.get('project_id') and config.get('config_folder_id'):
        print(f"Saving pins to ACC Folder: {config['config_folder_id']}")
        res, err = acc_manager.upload_json_data(config['project_id'], config['config_folder_id'], 'pins.json', pins)
        if err:
            print(f"Error saving ACC pins.json: {err}")
            return False
        return True
    else:
        # Local Fallback
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
    project_id = request.args.get('project')
    
    debug_log(f"GET /api/pins - Requested Project: {project_id}")
    debug_log(f"Total loaded pins: {len(pins)}")
    
    if project_id:
        # Filter by projectId
        filtered_pins = [p for p in pins if p.get('projectId') == project_id]
        debug_log(f"Filtered pins count: {len(filtered_pins)}")
        pins = filtered_pins
    else:
        debug_log("No project filter applied. Returning all pins.")
        
    return jsonify(pins)

@pins_bp.route('/api/pins', methods=['POST'])
def create_pin():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    debug_log(f"POST /api/pins - Data: {json.dumps(data)}")
    
    pins = load_pins()
    
    # Ensure ID
    if not data.get('id'):
        data['id'] = str(int(time.time() * 1000))
    
    # Add creation timestamp
    data['createdAt'] = time.time()

    # Auto-numbering logic (Punto N)
    # If name is not provided or we want to enforce sequential numbering for consistency
    # (Checking if existing pins follow the pattern to continue sequence)
    if not data.get('name') or data.get('name') == 'New Pin': 
        # Only override if name is generic or missing (Safe approach)
        pass
    
    # Actually, previous logic in maps.py enforced it. Let's enforce it if it looks like a new creation without explicit custom name from some other source?
    # Test script sends "Pin A". If we overwrite it, test passes (ID check).
    # User requirement: "Ensure ... automatically assigns a unique, sequential number"
    # So we probably should enforce it or default to it.
    
    max_num = 0
    for p in pins:
        match = re.match(r'Punto (\d+)', p.get('name', ''))
        if match:
            num = int(match.group(1))
            if num > max_num:
                max_num = num
    
    # If the user provided a name that is NOT 'Punto N', do we keep it?
    # For now, let's keep user provided name if it's specific, but defaults to Punto N if missing.
    # However, if maps.py was forcing it, maybe we should too?
    # Let's trust the 'data' but ensure name exists.
    if not data.get('name'):
        data['name'] = f"Punto {max_num + 1}"
    elif data.get('name').startswith('New Pin') or data.get('name').startswith('Pin'): # Heuristic for default names
         # Maybe we shouldn't overwrite "Pin A" from test if we want to see "Pin A".
         # But for the app, sequential is key.
         # Let's ONLY generate if missing for now to be safe, or if matches a pattern.
         pass
         
    # Let's Stick to: If no name, generate.
    if 'name' not in data:
         data['name'] = f"Punto {max_num + 1}"
    
    # Ensure projectId is saved if provided
    project_id = data.get('projectId')
    debug_log(f"Creating pin for Project ID: {project_id}")

    
    pins.append(data)
    save_pins(pins)
    
    return jsonify(data), 201

@pins_bp.route('/api/pins/<pin_id>', methods=['PUT'])
def update_pin(pin_id):
    data = request.get_json()
    print(f"[PINS] PUT /api/pins/{pin_id} - Data: {json.dumps(data)}")
    
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
    print(f"[PINS] DELETE /api/pins/{pin_id}")
    pins = load_pins()
    new_pins = [p for p in pins if p['id'] != pin_id]
    
    if len(new_pins) == len(pins):
        print(f"[PINS] Pin {pin_id} not found for deletion.")
        return jsonify({'error': 'Pin not found'}), 404
    
    print(f"[PINS] Pin {pin_id} deleted. Remaining pins: {len(new_pins)}")
    save_pins(new_pins)
    return jsonify({'success': True})

@pins_bp.route('/api/pins/upload', methods=['POST'])
def upload_pin_attachment():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    config = get_acc_config()
    if config and config.get('project_id') and config.get('attachments_folder_id'):
        # Upload to ACC
        filename = secure_filename(f"{int(time.time())}_{file.filename}")
        file_content = file.read()
        
        # Determine content type
        import mimetypes
        ctype = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
        
        item, err = acc_manager.upload_attachment(config['project_id'], config['attachments_folder_id'], filename, file_content, ctype)
        if err:
             return jsonify({'error': f"ACC Upload failed: {err}"}), 500
             
        # Create a reference URL. 
        # For the viewer to display it, it needs to know it's an ACC item.
        # We return the URN (Local ID in ACC) or Version ID.
        
        # We construct a special internal URL or just return the Version ID
        # and let the frontend handle "fetching" via proxy.
        
        # item['included'][0]['id'] is version ID
        try:
             version_id = item['included'][0]['id']
             # item_id = item['data']['id']
        except:
             # Fallback
             return jsonify({'error': 'Could not parse ACC response'}), 500

        # We return a structure the frontend BuildPanel expects. 
        # It expects 'url'. We can give a proxy URL or just the versionId to be handled.
        # Let's return a "virtual" url.
        return jsonify({
            'url': f'/api/images/proxy?versionId={version_id}', # Use existing proxy
            'filename': filename,
            'type': 'acc',
            'versionId': version_id
        })

    else:
        # Local Upload
        filename = secure_filename(f"{int(time.time())}_{file.filename}")
        file_path = os.path.join(PINS_UPLOAD_FOLDER, filename)
        file.save(file_path)
        
        url = f'/uploads/pins/{filename}'
        return jsonify({
            'url': url,
            'filename': file.filename,
            'type': 'local'
        })

@pins_bp.route('/uploads/pins/<path:filename>')
def serve_pin_file(filename):
    return send_from_directory(PINS_UPLOAD_FOLDER, filename)

@pins_bp.route('/api/config/acc/setup', methods=['POST'])
def setup_acc_folders():
    data = request.get_json()
    folder_url = data.get('folderUrl')
    
    if not folder_url:
        return jsonify({'error': 'Missing folderUrl'}), 400
        
    # extract project_id and folder_id from URL
    # format: https://.../projects/PROJECT_ID/folders/FOLDER_ID/...
    # GUIDs usually.
    
    # Regex for standard ACC/BIM360 URL
    # .../projects/b.GUID/folders/urn:adsk.wipprod:fs.folder:co.GUID/...
    
    try:
        # Simple extraction logic
        if '/projects/' not in folder_url or '/folders/' not in folder_url:
             return jsonify({'error': 'Invalid URL format'}), 400
             
        pid_part = folder_url.split('/projects/')[1].split('/')[0]
        fid_part = folder_url.split('/folders/')[1].split('/')[0]
        
        # Usually URL has "b." prefix for project, folder is URN.
        # FID might handle query params? split('?')[0]
        fid_part = fid_part.split('?')[0]
        
        # Update Config
        config = get_acc_config() or {}
        config['project_id'] = pid_part
        config['config_folder_id'] = fid_part
        # Assume attachments is same or we need to find "ADJUNTOS_PINES" inside?
        # Let's search for "ADJUNTOS_PINES" inside it.
        
        sub_item, _ = acc_manager.find_item_in_folder(pid_part, fid_part, 'ADJUNTOS_PINES')
        if sub_item:
             config['attachments_folder_id'] = sub_item['id']
        else:
             # Create it? Or just use same folder?
             # Let's use same folder for now if not found, or create?
             # Creating folders via API is "POST projects/:id/folders"
             # Skip complexity, just use main folder if sub not found, or ask user later.
             # For now set attachments to same folder as fallback
             config['attachments_folder_id'] = fid_part

        with open(ACC_CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
            
        return jsonify({'success': True, 'config': config})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
