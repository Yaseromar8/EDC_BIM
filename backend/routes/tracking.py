import os
import json
import traceback
from flask import Blueprint, request, jsonify
from db import get_db_connection
from datetime import datetime
from gcs_manager import generate_signed_url

tracking_bp = Blueprint('tracking', __name__)

def ensure_tracking_pins_table():
    """Crea o actualiza las tablas de tracking para soportar Multi-Tenant (model_urn)"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # 1. Tabla tracking_pins
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS tracking_pins (
                    id TEXT PRIMARY KEY,
                    pin_type TEXT NOT NULL DEFAULT 'avance',
                    x DOUBLE PRECISION,
                    y DOUBLE PRECISION,
                    z DOUBLE PRECISION,
                    val TEXT,
                    color TEXT,
                    data JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT NOW(),
                    model_urn VARCHAR(255) DEFAULT 'global'
                )
            ''')
            # Intentar agregar columna si la tabla existía antes
            cursor.execute("ALTER TABLE tracking_pins ADD COLUMN IF NOT EXISTS model_urn VARCHAR(255) DEFAULT 'global'")
            cursor.execute("ALTER TABLE tracking_pins ADD COLUMN IF NOT EXISTS specialty VARCHAR(100) DEFAULT 'General'")
            
            # 2. Add model_urn to other legacy tracking tables if needed (tracking_progress, tracking_details, photo_evidences)
            # Para tracking_progress (excel)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS tracking_progress (
                    id TEXT PRIMARY KEY,
                    nivel TEXT, clasificacion TEXT, partida TEXT, codigo_partida TEXT,
                    metrado_total DOUBLE PRECISION, metrado_ejecutado DOUBLE PRECISION,
                    unidad TEXT, porcentaje_avance DOUBLE PRECISION,
                    model_urn VARCHAR(255) DEFAULT 'global',
                    specialty VARCHAR(100) DEFAULT 'General'
                )
            ''')
            cursor.execute("ALTER TABLE tracking_progress ADD COLUMN IF NOT EXISTS model_urn VARCHAR(255) DEFAULT 'global'")
            cursor.execute("ALTER TABLE tracking_progress ADD COLUMN IF NOT EXISTS specialty VARCHAR(100) DEFAULT 'General'")
            
            # Para Detalles
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS tracking_details (
                    id SERIAL PRIMARY KEY,
                    pin_id TEXT, avance_parcial DOUBLE PRECISION, fecha DATE, comentario TEXT,
                    model_urn VARCHAR(255) DEFAULT 'global'
                )
            ''')
            cursor.execute("ALTER TABLE tracking_details ADD COLUMN IF NOT EXISTS model_urn VARCHAR(255) DEFAULT 'global'")

            # Para Evidencias fotográficas (legacy offline)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS photo_evidences (
                    id SERIAL PRIMARY KEY,
                    pin_id TEXT, gcs_url TEXT, filename TEXT, uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    model_urn VARCHAR(255) DEFAULT 'global'
                )
            ''')
            cursor.execute("ALTER TABLE photo_evidences ADD COLUMN IF NOT EXISTS model_urn VARCHAR(255) DEFAULT 'global'")
 
            # 3. Tabla de Partes Diarios (PRO EXECUTION)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS daily_reports (
                    id SERIAL PRIMARY KEY,
                    model_urn VARCHAR(255) NOT NULL,
                    report_date DATE NOT NULL,
                    weather VARCHAR(100),
                    personnel_count INTEGER DEFAULT 0,
                    critical_issues TEXT,
                    tasks_completed TEXT,
                    created_at TIMESTAMP DEFAULT NOW(),
                    performed_by VARCHAR(255),
                    UNIQUE(model_urn, report_date)
                )
            ''')
 
            conn.commit()
            print("[tracking] Tablas de tracking migradas a Multi-Tenant (model_urn).")
    except Exception as e:
        print(f"[tracking] Error asegurando tablas de tracking: {e}")

# Run on import
try:
    ensure_tracking_pins_table()
except Exception:
    pass

def get_tracking_data(model_urn='global'):
    """Construye el JSON de tracking desde la base de datos PostgreSQL"""
    data = {"avance": [], "fotos": [], "docs": [], "detalles": {}}
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # --- 1. Cargar Avance desde tabla original (Excel) ---
            cursor.execute("SELECT id, nivel, clasificacion, partida, codigo_partida, metrado_total, metrado_ejecutado, unidad, porcentaje_avance, specialty FROM tracking_progress WHERE model_urn = %s", (model_urn,))
            for row in cursor.fetchall():
                data["avance"].append({
                    "id": row[0],
                    "nivel": row[1],
                    "clasificacion": row[2],
                    "partida": row[3],
                    "CodigoDePartida": row[4],
                    "metrado_total": row[5],
                    "metrado_ejecutado": row[6],
                    "unidad": row[7],
                    "porcentaje_avance": row[8],
                    "specialty": row[9] or 'General'
                })
                
            # --- 2. Cargar Detalles de Pines ---
            cursor.execute("SELECT pin_id, avance_parcial, fecha, comentario FROM tracking_details WHERE pin_id IS NOT NULL AND model_urn = %s", (model_urn,))
            for row in cursor.fetchall():
                pin_id = str(row[0])
                if pin_id not in data["detalles"]:
                    data["detalles"][pin_id] = []
                data["detalles"][pin_id].append({
                    "avance_parcial": row[1],
                    "fecha": row[2].isoformat() if row[2] else None,
                    "comentario": row[3]
                })
                
            # --- 3. Cargar Evidencias (Fotos legacy) ---
            cursor.execute("SELECT pin_id, gcs_url, filename, uploaded_at FROM photo_evidences WHERE model_urn = %s", (model_urn,))
            fotos_dict = {}
            for row in cursor.fetchall():
                pin_id = str(row[0])
                if pin_id not in fotos_dict:
                    fotos_dict[pin_id] = {"pinId": pin_id, "photos": []}
                fotos_dict[pin_id]["photos"].append({
                    "url": row[1],
                    "name": row[2],
                    "date": row[3].isoformat() if row[3] else None
                })
            
            # --- 4. Cargar PINS de tracking (3D coordinates) ---
            cursor.execute("SELECT id, pin_type, x, y, z, val, color, data, specialty FROM tracking_pins WHERE model_urn = %s ORDER BY created_at", (model_urn,))
            for row in cursor.fetchall():
                pin = {
                    "id": row[0],
                    "x": row[2],   # x = index 2
                    "y": row[3],   # y = index 3
                    "z": row[4],   # z = index 4
                    "val": row[5],
                    "color": row[6],
                    "specialty": row[8] or 'General'
                }
                extra = row[7] or {}
                
                # REFRESH DOCS (Signed URLs for GCS)
                if "docs" in extra and isinstance(extra["docs"], list):
                    for doc in extra["docs"]:
                        if "fullPath" in doc:
                            fresh_url = generate_signed_url(doc["fullPath"])
                            if fresh_url:
                                doc["url"] = fresh_url
                        elif "url" in doc:
                            # Fallback: attempt refresh if bucket is in URL
                            bucket_name = os.environ.get("GCS_BUCKET_NAME")
                            if bucket_name and bucket_name in doc["url"]:
                                try:
                                    url_path = doc["url"].split(bucket_name + "/")[1].split("?")[0]
                                    fresh = generate_signed_url(url_path)
                                    if fresh: doc["url"] = fresh
                                except Exception: pass
                
                # REFRESH PHOTOS
                if "photos" in extra and isinstance(extra["photos"], list):
                    for photo in extra["photos"]:
                        # Refresh by path if available
                        if "fullPath" in photo:
                            fresh = generate_signed_url(photo["fullPath"])
                            if fresh: photo["url"] = fresh
                        # Fallback: recover from URL
                        elif "url" in photo:
                             bucket_name = os.environ.get("GCS_BUCKET_NAME")
                             if bucket_name and bucket_name in photo["url"]:
                                try:
                                    url_path = photo["url"].split(bucket_name + "/")[1].split("?")[0]
                                    fresh = generate_signed_url(url_path)
                                    if fresh: photo["url"] = fresh
                                except Exception: pass
                
                pin.update(extra)  # Merge any extra JSONB data (dbId, codigoPartida, docs, photos, etc.)
                
                pin_type = row[1]
                if pin_type == 'avance':
                    # Merge with existing avance or add
                    data["avance"].append(pin)
                elif pin_type == 'fotos':
                    # Only use legacy if photos doesn't exist in data column
                    if "photos" not in pin or not pin["photos"]:
                        legacy = fotos_dict.get(pin["id"])
                        if legacy:
                            # Refresh legacy photos if possible
                            for photo in legacy.get("photos", []):
                                bucket_name = os.environ.get("GCS_BUCKET_NAME")
                                if bucket_name and photo.get("url") and bucket_name in photo["url"]:
                                    try:
                                        url_path = photo["url"].split(bucket_name + "/")[1].split("?")[0]
                                        fresh = generate_signed_url(url_path)
                                        if fresh: photo["url"] = fresh
                                    except Exception: pass
                            pin["photos"] = legacy.get("photos", [])
                    
                    if pin["id"] in fotos_dict:
                        del fotos_dict[pin["id"]]
                        
                    data["fotos"].append(pin)
                elif pin_type == 'docs':
                    data["docs"].append(pin)
            
            # Add remaining legacy fotos that don't have a tracking_pin entry
            for pin_id, pin_group in fotos_dict.items():
                # Refresh URLs for these too
                for photo in pin_group.get("photos", []):
                    bucket_name = os.environ.get("GCS_BUCKET_NAME")
                    if bucket_name and photo.get("url") and bucket_name in photo["url"]:
                        try:
                            url_path = photo["url"].split(bucket_name + "/")[1].split("?")[0]
                            fresh = generate_signed_url(url_path)
                            if fresh: photo["url"] = fresh
                        except Exception: pass
                data["fotos"].append({"id": pin_id, **pin_group})
            
    except Exception as e:
        print(f"Error construyendo get_tracking_data desde SQL: {e}")
        traceback.print_exc()
    return data

@tracking_bp.route('/api/tracking', methods=['GET'])
def get_tracking():
    model_urn = request.args.get('model_urn', 'global')
    data = get_tracking_data(model_urn)
    return jsonify(data)

@tracking_bp.route('/api/tracking', methods=['POST'])
def update_tracking():
    """Actualiza la informacion en PostgreSQL basandose en el payload del cliente"""
    try:
        new_data = request.json
        model_urn = request.args.get('model_urn', 'global')
        
        if not new_data:
            return jsonify({"error": "No data provided"}), 400
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # 1. Sincronizar 'avance' (tabla original Excel)
            if 'avance' in new_data:
                cursor.execute("DELETE FROM tracking_progress WHERE model_urn = %s", (model_urn,))
                # Separate Excel-imported avance (no x,y,z) from 3D pin avance (has x,y,z)
                for item in new_data['avance']:
                    if item.get('x') is not None:
                        # This is a 3D pin - store in tracking_pins
                        _upsert_pin(cursor, item, 'avance', model_urn)
                    else:
                        # This is an Excel row - store in tracking_progress
                        cursor.execute('''
                            INSERT INTO tracking_progress (id, nivel, clasificacion, partida, codigo_partida, metrado_total, metrado_ejecutado, unidad, porcentaje_avance, model_urn, specialty)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ''', (
                            item.get('id'), item.get('nivel'), item.get('clasificacion'),
                            item.get('partida'), item.get('CodigoDePartida'),
                            item.get('metrado_total', 0), item.get('metrado_ejecutado', 0),
                            item.get('unidad'), item.get('porcentaje_avance', 0),
                            model_urn, item.get('specialty', 'General')
                        ))
            
            # 2. Sincronizar 'detalles'
            if 'detalles' in new_data:
                cursor.execute("DELETE FROM tracking_details WHERE model_urn = %s", (model_urn,))
                for pin_id, rows in new_data['detalles'].items():
                    for row in rows:
                        cursor.execute('''
                            INSERT INTO tracking_details (pin_id, avance_parcial, fecha, comentario, model_urn)
                            VALUES (%s, %s, %s, %s, %s)
                        ''', (
                            pin_id, row.get('avance_parcial', 0), 
                            row.get('fecha'), row.get('comentario', ''),
                            model_urn
                        ))
            
            # 3. Sincronizar 'fotos' (3D pins)
            if 'fotos' in new_data:
                # Remove old foto pins
                cursor.execute("DELETE FROM tracking_pins WHERE pin_type = 'fotos' AND model_urn = %s", (model_urn,))
                cursor.execute("DELETE FROM photo_evidences WHERE model_urn = %s", (model_urn,))
                for pin_item in new_data['fotos']:
                    if pin_item.get('x') is not None:
                        _upsert_pin(cursor, pin_item, 'fotos', model_urn)
                    # Also save photos to photo_evidences for legacy support
                    pin_id = pin_item.get('id') or pin_item.get('pinId')
                    for photo in pin_item.get('photos', []):
                        cursor.execute('''
                            INSERT INTO photo_evidences (pin_id, gcs_url, filename, model_urn)
                            VALUES (%s, %s, %s, %s)
                        ''', (pin_id, photo.get('url', photo.get('src', '')), photo.get('name', photo.get('desc', 'photo.jpg')), model_urn))

            # 4. Sincronizar 'docs' (3D pins with attached documents)
            if 'docs' in new_data:
                cursor.execute("DELETE FROM tracking_pins WHERE pin_type = 'docs' AND model_urn = %s", (model_urn,))
                for pin_item in new_data['docs']:
                    _upsert_pin(cursor, pin_item, 'docs', model_urn)
                        
            conn.commit()
            
        return jsonify(get_tracking_data(model_urn))

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


def _upsert_pin(cursor, item, pin_type, model_urn):
    """Helper: Insert or update a tracking pin in the tracking_pins table"""
    pin_id = item.get('id')
    if not pin_id:
        return
    
    # Extract standard fields
    x = item.get('x')
    y = item.get('y')
    z = item.get('z')
    val = item.get('val')
    color = item.get('color')
    
    # Everything else goes into JSONB 'data'
    extra = {k: v for k, v in item.items() 
             if k not in ('id', 'x', 'y', 'z', 'val', 'color', '_element')}
    
    cursor.execute('''
        INSERT INTO tracking_pins (id, pin_type, x, y, z, val, color, data, model_urn, specialty)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            x = EXCLUDED.x, y = EXCLUDED.y, z = EXCLUDED.z,
            val = EXCLUDED.val, color = EXCLUDED.color, data = EXCLUDED.data,
            model_urn = EXCLUDED.model_urn, specialty = EXCLUDED.specialty
    ''', (pin_id, pin_type, x, y, z, val, color, json.dumps(extra, default=str), model_urn, item.get('specialty', 'General')))

@tracking_bp.route('/api/tracking/photo', methods=['POST'])
def add_photo_to_pin():
    """Sube foto ligada a un PIN de Tracking hacia GCS y guarda en BD"""
    try:
        from gcs_manager import upload_file_to_gcs
        import time
        from werkzeug.utils import secure_filename
        
        pin_id = request.form.get('pinId')
        model_urn = request.form.get('model_urn', 'global')
        
        if 'file' not in request.files or not pin_id:
            return jsonify({"error": "Falta 'file' o 'pinId'"}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "Archivo vacio"}), 400
            
        # 1. Subir a GCS
        filename = secure_filename(f"{int(time.time())}_{file.filename}")
        gcs_uuid = f"multi-tenant/{model_urn}/tracking_photos/{filename}"
        gcs_url = upload_file_to_gcs(file, gcs_uuid)
        
        if not gcs_url:
            return jsonify({"error": "Fallo la subida a GCS"}), 500
            
        # 2. Guardar en Base de Datos PostgreSQL
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO photo_evidences (pin_id, gcs_url, filename, model_urn)
                VALUES (%s, %s, %s, %s)
            ''', (pin_id, gcs_url, filename, model_urn))
            conn.commit()
            
        # Devolver data sincronizada
        return jsonify({"status": "success", "data": get_tracking_data(model_urn)})
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@tracking_bp.route('/api/tracking/daily-reports', methods=['GET'])
def list_daily_reports():
    model_urn = request.args.get('model_urn', 'global')
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT report_date, weather, personnel_count, critical_issues, tasks_completed, performed_by
                FROM daily_reports
                WHERE model_urn = %s
                ORDER BY report_date DESC
            """, (model_urn,))
            rows = cursor.fetchall()
            reports = [{
                "date": r[0].isoformat() if r[0] else None,
                "weather": r[1],
                "personnel": r[2],
                "issues": r[3],
                "tasks": r[4],
                "user": r[5]
            } for r in rows]
        return jsonify(reports)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@tracking_bp.route('/api/tracking/daily-reports', methods=['POST'])
def save_daily_report():
    data = request.json
    model_urn = data.get('model_urn', 'global')
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO daily_reports (model_urn, report_date, weather, personnel_count, critical_issues, tasks_completed, performed_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (model_urn, report_date) DO UPDATE SET
                    weather = EXCLUDED.weather,
                    personnel_count = EXCLUDED.personnel_count,
                    critical_issues = EXCLUDED.critical_issues,
                    tasks_completed = EXCLUDED.tasks_completed,
                    performed_by = EXCLUDED.performed_by
            """, (
                model_urn, data.get('date'), data.get('weather'),
                data.get('personnel', 0), data.get('issues', ''),
                data.get('tasks', ''), data.get('user', 'Sistema')
            ))
            conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

