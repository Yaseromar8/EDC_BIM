import os
import json
import time
import re
from flask import Blueprint, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from db import get_db_connection
from gcs_manager import upload_file_to_gcs

pins_bp = Blueprint('pins', __name__)

PINS_UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads', 'pins')
os.makedirs(PINS_UPLOAD_FOLDER, exist_ok=True)

def ensure_pins_table():
    """Asegura que la tabla control_pins soporte multi-tenant."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS control_pins (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    type TEXT DEFAULT 'avance',
                    x_coord DOUBLE PRECISION,
                    y_coord DOUBLE PRECISION,
                    z_coord DOUBLE PRECISION,
                    project_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            # Migración: Añadir project_id y attachment_urn si no existen
            cursor.execute("ALTER TABLE control_pins ADD COLUMN IF NOT EXISTS project_id TEXT;")
            cursor.execute("ALTER TABLE control_pins ADD COLUMN IF NOT EXISTS attachment_urn TEXT;")
            conn.commit()
            print("[pins] Tabla control_pins verificada (con attachment_urn).")
    except Exception as e:
        print(f"[pins] Error en ensure_pins_table: {e}")

# Inicializar al importar
try:
    ensure_pins_table()
except:
    pass

def debug_log(msg):
    try:
        log_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'pins_debug.log')
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"{time.ctime()}: {msg}\n")
    except Exception as e:
        print(f"DEBUG LOG ERROR: {e}")

@pins_bp.route('/api/pins', methods=['GET'])
def get_pins():
    project_id = request.args.get('project')
    debug_log(f"GET /api/pins - Requested Project: {project_id}")
    
    if not project_id:
        return jsonify({"error": "project query parameter is required"}), 400

    pins = []
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # CRITICO: Filtrar por project_id para evitar fuga de datos
            cursor.execute("""
                SELECT id, name, type, x_coord, y_coord, z_coord, created_at, updated_at, attachment_urn 
                FROM control_pins 
                WHERE project_id = %s OR project_id IS NULL
                ORDER BY created_at ASC
            """, (project_id,))
            rows = cursor.fetchall()
            for row in rows:
                urn = row[8]
                pin = {
                    "id": row[0],
                    "name": row[1],
                    "type": row[2],
                    "x_coord": row[3],
                    "y_coord": row[4],
                    "z_coord": row[5],
                    "createdAt": row[6].timestamp() if row[6] else time.time(),
                    "projectId": project_id,
                    "attachment_urn": urn
                }
                if urn:
                    pin["attachment_url"] = f"/api/docs/proxy?urn={urn}"
                pins.append(pin)
        return jsonify(pins), 200
    except Exception as e:
        print(f"Error GET pins: {e}")
        return jsonify({"error": str(e)}), 500

@pins_bp.route('/api/pins', methods=['POST'])
def create_pin():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    debug_log(f"POST /api/pins - Data: {json.dumps(data)}")
    
    pin_id = data.get('id')
    if not pin_id:
        pin_id = str(int(time.time() * 1000))
        data['id'] = pin_id
    
    pin_type = data.get('type', 'avance')
    x = data.get('x_coord', 0)
    y = data.get('y_coord', 0)
    z = data.get('z_coord', 0)
    attachment_urn = data.get('attachment_urn')
    
    # Logica de Autonumeracion
    pin_name = data.get('name')
    if not pin_name or pin_name.startswith('New Pin') or pin_name.startswith('Pin'):
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM control_pins WHERE name LIKE 'Punto %'")
                rows = cursor.fetchall()
                max_num = 0
                for row in rows:
                    match = re.match(r'Punto (\d+)', row[0])
                    if match:
                        num = int(match.group(1))
                        if num > max_num:
                            max_num = num
                pin_name = f"Punto {max_num + 1}"
                data['name'] = pin_name
        except Exception as e:
            print(f"Error autonumerando: {e}")
            if not pin_name: pin_name = f"Punto {int(time.time() % 10000)}"
            data['name'] = pin_name

    project_id = data.get('projectId')

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO control_pins (id, name, type, x_coord, y_coord, z_coord, project_id, attachment_urn)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ''', (pin_id, pin_name, pin_type, x, y, z, project_id, attachment_urn))
            conn.commit()
    except Exception as e:
        print(f"Error POST pin: {e}")
        return jsonify({"error": str(e)}), 500
        
    return jsonify(data), 201

@pins_bp.route('/api/pins/<pin_id>', methods=['PUT'])
def update_pin(pin_id):
    data = request.get_json()
    print(f"[PINS] PUT /api/pins/{pin_id} - Data: {json.dumps(data)}")
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    name = data.get('name')
    ptype = data.get('type')
    attachment_urn = data.get('attachment_urn')
    
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            updates = []
            values = []
            if name is not None:
                updates.append("name = %s")
                values.append(name)
            if ptype is not None:
                updates.append("type = %s")
                values.append(ptype)
            if attachment_urn is not None:
                updates.append("attachment_urn = %s")
                values.append(attachment_urn)
            
            updates.append("updated_at = CURRENT_TIMESTAMP")
            
            if not updates:
                return jsonify(data)
                
            values.append(pin_id)
            query = f"UPDATE control_pins SET {', '.join(updates)} WHERE id = %s"
            
            cursor.execute(query, tuple(values))
            
            if cursor.rowcount == 0:
                return jsonify({'error': 'Pin not found'}), 404
                
            conn.commit()
            
        return jsonify(data)
    except Exception as e:
        print(f"Error PUT pin: {e}")
        return jsonify({"error": str(e)}), 500

@pins_bp.route('/api/pins/<pin_id>', methods=['DELETE'])
def delete_pin(pin_id):
    print(f"[PINS] DELETE /api/pins/{pin_id}")
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM control_pins WHERE id = %s", (pin_id,))
            if cursor.rowcount == 0:
                return jsonify({'error': 'Pin not found'}), 404
            conn.commit()
            
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error DELETE pin: {e}")
        return jsonify({"error": str(e)}), 500

@pins_bp.route('/api/pins/upload', methods=['POST'])
def upload_pin_attachment():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    pin_id = request.form.get('pinId')
    project_id = request.form.get('projectId', 'global')

    filename = secure_filename(f"{int(time.time())}_{file.filename}")
    gcs_urn = f"multi-tenant/{project_id}/pin_attachments/{filename}"
    
    print(f"[PINS] Subiendo adjunto de pin a GCS: {gcs_urn}")
    
    # Subida pura a la Nube!
    gcs_url = upload_file_to_gcs(file, gcs_urn)
    
    if gcs_url:
        # Si tenemos un pinId, lo guardamos de una vez
        if pin_id:
            try:
                with get_db_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("UPDATE control_pins SET attachment_urn = %s WHERE id = %s", (gcs_urn, pin_id))
                    conn.commit()
            except Exception as e:
                print(f"Error actualizando pin con URN: {e}")

        return jsonify({
            'url': f"/api/docs/proxy?urn={gcs_urn}",
            'urn': gcs_urn,
            'filename': filename,
            'type': 'gcs'
        })
    else:
        # Fallback local de rescate si Google Cloud falla o pierde acceso momentaneo
        file_path = os.path.join(PINS_UPLOAD_FOLDER, filename)
        file.seek(0)
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

# Mantener por retrocompatibilidad de setup (no estricto si no usa ACC)
@pins_bp.route('/api/config/acc/setup', methods=['POST'])
def setup_acc_folders():
    return jsonify({'success': True, 'message': 'Storage has been migrated to Google Cloud'})
