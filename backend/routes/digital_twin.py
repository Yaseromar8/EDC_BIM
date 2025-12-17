import os
import time
import json
import base64
import traceback
import requests
from datetime import datetime
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from aps import get_internal_token

digital_twin_bp = Blueprint('digital_twin', __name__)

# Constants
# Constants
CONFIG_FILE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "digital_twin_config.json")

def get_project_config_internal():
    """Reads the config JSON from local file."""
    if not os.path.exists(CONFIG_FILE_PATH):
        return {"models": []}
    try:
        with open(CONFIG_FILE_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error reading local config: {e}")
        return {"models": []}

def save_project_config_internal(config):
    """Writes the config JSON to local file."""
    try:
        with open(CONFIG_FILE_PATH, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving local config: {e}")
        return False

def trigger_translation(urn, token):
    """Triggers SVF translation for a given URN."""
    url = 'https://developer.api.autodesk.com/modelderivative/v2/designdata/job'
    headers = {
        'Authorization': f'Bearer {token}', 
        'Content-Type': 'application/json',
        'x-ads-force': 'true'
    }
    payload = {
        'input': {'urn': urn},
        'output': {
            'formats': [
                {'type': 'svf', 'views': ['2d', '3d']}
            ]
        }
    }
    try:
        resp = requests.post(url, headers=headers, json=payload)
        if resp.status_code == 200 or resp.status_code == 201:
            print(f"[trigger_translation] Success for {urn}")
            return True
        else:
            print(f"[trigger_translation] Failed: {resp.text}")
            return False
    except Exception as e:
        print(f"[trigger_translation] Exception: {e}")
        return False

# Routes
@digital_twin_bp.route('/api/config/project', methods=['GET'])
def get_config_route():
    config = get_project_config_internal()
    
    # Auto-update logic: Check for latest versions of linked docs
    # Only verify if we have a token and models to check
    token, error = get_internal_token()
    if not error and token:
        updated_any = False
        models = config.get('models', [])
        
        for model in models:
            if model.get('source') == 'DOCS' and model.get('projectId') and model.get('itemId'):
                try:
                    # Quick check for latest tip
                    url = f"https://developer.api.autodesk.com/data/v1/projects/{model['projectId']}/items/{model['itemId']}"
                    headers = {'Authorization': f'Bearer {token}'}
                    resp = requests.get(url, headers=headers, timeout=2) # Short timeout to not block too long
                    
                    if resp.ok:
                        data = resp.json()
                        latest_version_id = data['data']['relationships']['tip']['data']['id']
                        current_version_id = model.get('versionId')
                        
                        if latest_version_id and latest_version_id != current_version_id:
                            print(f"[AutoUpdate] Updating {model['name']} to {latest_version_id}")
                            
                            # Calculate new URN
                            urn_bytes = base64.urlsafe_b64encode(latest_version_id.encode('utf-8'))
                            new_urn = urn_bytes.decode('utf-8').rstrip('=')
                            
                            model['urn'] = new_urn
                            model['versionId'] = latest_version_id
                            # We could also trigger translation here if needed, but Viewer usually handles it or we'll assume it exists.
                            # Optimistically assume SVF exists for the version in ACC.
                            
                            updated_any = True
                except Exception as e:
                    print(f"[AutoUpdate] Failed to check {model.get('name')}: {e}")
                    continue
        
        if updated_any:
            save_project_config_internal(config)
            
    return jsonify(config)

@digital_twin_bp.route('/api/config/project/add', methods=['POST'])
def add_model_link():
    data = request.get_json()
    if not data or 'urn' not in data:
        return jsonify({'error': 'Missing URN'}), 400
        
    config = get_project_config_internal()
    
    existing = next((m for m in config.get('models', []) if m['urn'] == data['urn']), None)
    if existing:
        return jsonify(config)
        
    new_model = {
        'id': str(int(time.time() * 1000)),
        'name': data.get('name', 'Unknown Model'),
        'urn': data['urn'],
        'source': 'DOCS',
        'region': data.get('region', 'US'),
        'projectId': data.get('projectId'),
        'itemId': data.get('itemId'),
        'versionId': data.get('versionId'),
        'added_at': datetime.utcnow().isoformat()
    }
    
    config.setdefault('models', []).append(new_model)
    save_project_config_internal(config)
    
    return jsonify(config)

@digital_twin_bp.route('/api/config/project/update', methods=['POST'])
def update_model_link():
    data = request.get_json()
    if not data or 'urn' not in data:
        return jsonify({'error': 'Missing URN'}), 400
    
    config = get_project_config_internal()
    model = next((m for m in config.get('models', []) if m['urn'] == data['urn']), None)
    
    if not model:
        return jsonify({'error': 'Model not found'}), 404
        
    if not model.get('projectId') or not model.get('itemId'):
        # Just reload if we can't check for updates
        return jsonify(config) # Or return specific status to frontend
        
    # Check for new version from APS
    try:
        token, error = get_internal_token()
        if error or not token:
             return jsonify({'error': 'Internal auth failed', 'details': error}), 500
             
        project_id = model['projectId']
        item_id = model['itemId']
        
        # Get Item Tip (Latest Version)
        url = f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/items/{item_id}"
        headers = {'Authorization': f'Bearer {token}'}
        
        resp = requests.get(url, headers=headers)
        if not resp.ok:
            return jsonify({'error': 'Failed to fetch item details from APS'}), 502
            
        item_data = resp.json()
        
        latest_version_id = item_data['data']['relationships']['tip']['data']['id']
        current_version_id = model.get('versionId')
        
        if latest_version_id != current_version_id:
            # New version detected!
            print(f"Updating model {model['name']} from {current_version_id} to {latest_version_id}")
            
            # Calculate new URN
            # Standard URN is base64 encoded version_id (no padding)
            urn_bytes = base64.urlsafe_b64encode(latest_version_id.encode('utf-8'))
            new_urn = urn_bytes.decode('utf-8').rstrip('=')
            
            # Update Model Record
            model['urn'] = new_urn
            model['versionId'] = latest_version_id
            
            # Optional: Update Name if changed?
            # We can fetch version details if we want the new name:
            # v_url = f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/versions/{latest_version_id}"
            # v_resp = requests.get(v_url, headers=headers)
            # if v_resp.ok:
            #    model['name'] = v_resp.json()['data']['attributes']['name'] 
            
            save_project_config_internal(config)
            return jsonify({'updated': True, 'config': config, 'newUrn': new_urn})
        else:
            return jsonify({'updated': False, 'message': 'Already latest version', 'config': config})
            
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@digital_twin_bp.route('/api/config/project/upload', methods=['POST'])
def upload_local_model():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file part'}), 400
        file = request.files['file']
        label = request.form.get('label') or file.filename
        
        token, error = get_internal_token()
        if error or not token:
             return jsonify({'error': 'Internal auth failed', 'details': error}), 500
             
        bucket_key = get_app_bucket_key()
        if not ensure_bucket_exists(bucket_key, token):
             return jsonify({'error': 'Could not create bucket'}), 500
        
        object_name = f"{int(time.time())}_{secure_filename(file.filename)}"
        url = f'https://developer.api.autodesk.com/oss/v2/buckets/{bucket_key}/objects/{object_name}'
        
        file_content = file.read()
        headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/octet-stream'}
        up_resp = requests.put(url, headers=headers, data=file_content)
        
        if not up_resp.ok:
            return jsonify({'error': f"Upload failed: {up_resp.text}"}), 500
            
        object_data = up_resp.json()
        object_id = object_data.get('objectId')
        
        urn_bytes = base64.urlsafe_b64encode(object_id.encode('utf-8'))
        urn = urn_bytes.decode('utf-8').rstrip('=')
        
        translation_triggered = trigger_translation(urn, token)
        
        config = get_project_config_internal()
        new_model = {
            'id': str(int(time.time() * 1000)),
            'name': label,
            'urn': urn,
            'source': 'UPLOAD',
            'status': 'translating' if translation_triggered else 'error',
            'object_id': object_id,
            'added_at': datetime.utcnow().isoformat()
        }
        config.setdefault('models', []).append(new_model)
        save_project_config_internal(config)
        
        return jsonify({'config': config, 'model': new_model})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500

@digital_twin_bp.route('/api/config/project/remove', methods=['POST'])
def remove_model_link():
    data = request.get_json()
    if not data or 'urn' not in data:
        return jsonify({'error': 'Missing URN'}), 400
        
    config = get_project_config_internal()
    original_len = len(config.get('models', []))
    config['models'] = [m for m in config.get('models', []) if m['urn'] != data['urn']]
    
    if len(config['models']) < original_len:
        save_project_config_internal(config)
        
    return jsonify(config)
