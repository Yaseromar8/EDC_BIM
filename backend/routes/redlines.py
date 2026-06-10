from flask import Blueprint, jsonify, request
from db import get_db_connection, resolve_project_id
import uuid
import json

redlines_bp = Blueprint('redlines_bp', __name__)

@redlines_bp.route('/<path:model_urn>', methods=['GET'])
def get_redlines(model_urn):
    """Obtiene la lista de Red Lines de un proyecto."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, codigo, titulo, estado, responsable, fecha, adjuntos, created_by, respuesta, fecha_respuesta
                FROM doc_redlines 
                WHERE model_urn = %s 
                ORDER BY created_at DESC
            ''', (model_urn,))
            
            items = []
            for row in cursor.fetchall():
                items.append({
                    "id": str(row[0]),
                    "codigo": row[1],
                    "titulo": row[2] or "",
                    "estado": row[3],
                    "responsable": row[4] or "",
                    "fecha": row[5].isoformat() if row[5] else None,
                    "adjuntos": row[6] if isinstance(row[6], list) else json.loads(row[6] or '[]'),
                    "created_by": row[7],
                    "respuesta": row[8] or "",
                    "fecha_respuesta": row[9].isoformat() if row[9] else None
                })
            
            return jsonify({"results": items})
    except Exception as e:
        print(f"Error GET /api/redlines: {e}")
        return jsonify({"error": str(e)}), 500

@redlines_bp.route('', methods=['POST'])
def create_redline():
    """Crea una nueva fila en blanco de Red Line."""
    data = request.json
    model_urn = data.get('model_urn')
    if not model_urn:
        return jsonify({"error": "model_urn es obligatorio"}), 400
        
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT COUNT(*) FROM doc_redlines WHERE model_urn = %s
            ''', (model_urn,))
            count = cursor.fetchone()[0]
            codigo = f"RL-{(count + 1):03d}"
            
            created_by = data.get('created_by', 'Sistema')
            titulo = data.get('titulo', '')
            
            cursor.execute('''
                INSERT INTO doc_redlines (model_urn, codigo, titulo, created_by, project_id)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, fecha
            ''', (model_urn, codigo, titulo, created_by, resolve_project_id(model_urn)))
            
            res = cursor.fetchone()
            item_id = str(res[0])
            fecha = res[1]
            conn.commit()
            
            return jsonify({
                "message": "Red Line Creado",
                "rfi": {
                    "id": item_id,
                    "codigo": codigo,
                    "titulo": titulo,
                    "estado": "Emitido",
                    "responsable": "",
                    "fecha": fecha.isoformat() if fecha else None,
                    "adjuntos": [],
                    "created_by": created_by,
                    "respuesta": "",
                    "fecha_respuesta": None
                }
            })
    except Exception as e:
        print(f"Error POST /api/redlines: {e}")
        return jsonify({"error": str(e)}), 500

@redlines_bp.route('/<redline_id>', methods=['PATCH'])
def update_redline(redline_id):
    """Actualiza campos específicos de un Red Line (Inline Editing)."""
    data = request.json
    if not data:
        return jsonify({"error": "No data provided"}), 400
        
    allowed_fields = ['titulo', 'estado', 'responsable', 'fecha', 'adjuntos', 'respuesta', 'fecha_respuesta']
    updates = []
    values = []
    
    for key, value in data.items():
        if key in allowed_fields:
            if key == 'adjuntos':
                updates.append("adjuntos = %s::jsonb")
                values.append(json.dumps(value))
            elif key in ['fecha', 'fecha_respuesta']:
                updates.append(f"{key} = %s")
                values.append(value if value else None)
            else:
                updates.append(f"{key} = %s")
                values.append(value)
                
    if not updates:
        return jsonify({"message": "No valid fields to update"}), 200
        
    updates.append("updated_at = CURRENT_TIMESTAMP")
    values.append(redline_id)
    
    query = f"UPDATE doc_redlines SET {', '.join(updates)} WHERE id = %s RETURNING id"
    
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, tuple(values))
            if cursor.fetchone():
                conn.commit()
                return jsonify({"message": "Updated successfully"})
            else:
                return jsonify({"error": "Red Line not found"}), 404
    except Exception as e:
        print(f"Error PATCH /api/redlines: {e}")
        return jsonify({"error": str(e)}), 500
