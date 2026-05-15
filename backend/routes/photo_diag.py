"""Diagnostic endpoint to check photo data health"""
from flask import Blueprint, jsonify, request
import os, traceback

photo_diag_bp = Blueprint('photo_diag', __name__)

@photo_diag_bp.route('/api/debug/photos', methods=['GET'])
def diagnose_photos():
    """Check all photo pins and verify their GCS status"""
    from db import get_db_connection
    
    results = []
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, data FROM tracking_pins WHERE pin_type='fotos' ORDER BY created_at DESC LIMIT 10")
            for row in cursor.fetchall():
                pin_id = row[0]
                data = row[1] or {}
                photos = data.get('photos', [])
                pin_info = {
                    'pin_id': pin_id,
                    'photo_count': len(photos),
                    'photos': []
                }
                for p in photos:
                    photo_info = {
                        'desc': p.get('desc', 'N/A'),
                        'date': p.get('date', 'N/A'),
                        'has_src': bool(p.get('src')),
                        'has_url': bool(p.get('url')),
                        'has_gcs_urn': bool(p.get('gcs_urn')),
                        'has_fullPath': bool(p.get('fullPath')),
                        'gcs_urn': p.get('gcs_urn', 'MISSING'),
                        'fullPath': p.get('fullPath', 'MISSING'),
                        'src_preview': (p.get('src') or '')[:100],
                        'gcs_exists': False
                    }
                    # Check if file actually exists in GCS
                    gcs_urn = p.get('gcs_urn')
                    if gcs_urn:
                        try:
                            from gcs_manager import get_blob_data
                            content, _ = get_blob_data(gcs_urn)
                            photo_info['gcs_exists'] = content is not None
                            photo_info['gcs_size'] = len(content) if content else 0
                        except Exception as e:
                            photo_info['gcs_error'] = str(e)
                    
                    pin_info['photos'].append(photo_info)
                results.append(pin_info)
        
        return jsonify({'status': 'ok', 'pins': results})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'status': 'error', 'error': str(e)}), 500
