from flask import Blueprint, jsonify, request
from db import get_db_connection, resolve_project_id
import uuid
import json
from perimetro_de_obra import guardia_de_recurso

rfis_bp = Blueprint('rfis_bp', __name__)

@rfis_bp.route('/<path:model_urn>', methods=['GET'])
def get_rfis(model_urn):
    """Obtiene la lista de RFIs de un proyecto."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, codigo, titulo, estado, responsable, fecha, adjuntos, created_by, respuesta, fecha_respuesta
                FROM doc_rfis 
                WHERE model_urn = %s 
                ORDER BY created_at DESC
            ''', (model_urn,))
            
            rfis = []
            for row in cursor.fetchall():
                rfis.append({
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
            
            return jsonify({"results": rfis})
    except Exception as e:
        print(f"Error GET /api/rfis: {e}")
        return jsonify({"error": str(e)}), 500

@rfis_bp.route('', methods=['POST'])
def create_rfi():
    """Crea una nueva fila en blanco de RFI o un RFI estructurado."""
    data = request.json
    model_urn = data.get('model_urn')
    if not model_urn:
        return jsonify({"error": "model_urn es obligatorio"}), 400
        
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Autogenerate logic for RFI code (RFI-001, etc.)
            cursor.execute('''
                SELECT COUNT(*) FROM doc_rfis WHERE model_urn = %s
            ''', (model_urn,))
            count = cursor.fetchone()[0]
            codigo = f"RFI-{(count + 1):03d}"
            
            created_by = data.get('created_by', 'Sistema')
            titulo = data.get('titulo', '')
            
            cursor.execute('''
                INSERT INTO doc_rfis (model_urn, codigo, titulo, created_by, project_id)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, fecha
            ''', (model_urn, codigo, titulo, created_by, resolve_project_id(model_urn)))
            
            res = cursor.fetchone()
            rfi_id = str(res[0])
            fecha = res[1]
            conn.commit()
            
            return jsonify({
                "message": "RFI Creado",
                "rfi": {
                    "id": rfi_id,
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
        print(f"Error POST /api/rfis: {e}")
        return jsonify({"error": str(e)}), 500

@rfis_bp.route('/<rfi_id>', methods=['PATCH'])
def update_rfi(rfi_id):
    """Actualiza campos específicos de un RFI (Inline Editing)."""
    # De que obra es este recurso. Sin esto, conocer el id bastaba
    # para escribir en el expediente de otra obra.
    negativa = guardia_de_recurso('doc_rfis', rfi_id)
    if negativa:
        return negativa
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
    values.append(rfi_id)
    
    query = f"UPDATE doc_rfis SET {', '.join(updates)} WHERE id = %s RETURNING id"
    
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, tuple(values))
            if cursor.fetchone():
                conn.commit()
                return jsonify({"message": "Updated successfully"})
            else:
                return jsonify({"error": "RFI not found"}), 404
    except Exception as e:
        print(f"Error PATCH /api/rfis: {e}")
        return jsonify({"error": str(e)}), 500
