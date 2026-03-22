from flask import Blueprint, request, jsonify
from primavera_processor import parse_primavera_xml
import os

schedule_bp = Blueprint('schedule', __name__)

@schedule_bp.route('/upload-local', methods=['POST'])
def upload_local_schedule():
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No se encontró el archivo'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'Nombre de archivo vacío'}), 400

    try:
        xml_content = file.read().decode('utf-8')
        result = parse_primavera_xml(xml_content)
        
        if result['success']:
            return jsonify({
                'success': True,
                'schedule': {
                    'name': file.filename,
                    'tasks': result.get('tasks', []),
                    'wbs': result.get('wbs', [])
                }
            })
        else:
            return jsonify({'success': False, 'error': result['error']}), 500
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
