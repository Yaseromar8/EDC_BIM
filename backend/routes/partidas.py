from flask import Blueprint, jsonify, request
from db import get_db_connection
import json

partidas_bp = Blueprint('partidas_bp', __name__)

@partidas_bp.route('/<path:model_urn>', methods=['GET'])
def get_partidas(model_urn):
    """Obtiene la lista de partidas de un proyecto."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, item, descripcion, unidad, metrado, precio_unitario, precio, incidencia, metodologia, software, avance, created_by
                FROM doc_partidas 
                WHERE model_urn = %s 
                ORDER BY created_at ASC
            ''', (model_urn,))
            
            partidas = []
            for row in cursor.fetchall():
                partidas.append({
                    "id": str(row[0]),
                    "item": row[1] or "",
                    "descripcion": row[2] or "",
                    "unidad": row[3] or "",
                    "metrado": float(row[4]) if row[4] is not None else 0.0,
                    "precio_unitario": float(row[5]) if row[5] is not None else 0.0,
                    "precio": float(row[6]) if row[6] is not None else 0.0,
                    "incidencia": float(row[7]) if row[7] is not None else 0.0,
                    "metodologia": row[8] or "",
                    "software": row[9] or "",
                    "avance": float(row[10]) if row[10] is not None else 0.0,
                    "created_by": row[11] or ""
                })
            
            return jsonify({"results": partidas})
    except Exception as e:
        print(f"Error GET /api/partidas: {e}")
        return jsonify({"error": str(e)}), 500

@partidas_bp.route('', methods=['POST'])
def create_partida():
    """Crea una nueva fila en blanco de Partida."""
    data = request.json
    model_urn = data.get('model_urn')
    if not model_urn:
        return jsonify({"error": "model_urn es obligatorio"}), 400
        
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            created_by = data.get('created_by', 'Sistema')
            descripcion = data.get('descripcion', 'Nueva Partida')
            item = data.get('item', '')
            
            cursor.execute('''
                INSERT INTO doc_partidas (model_urn, item, descripcion, created_by)
                VALUES (%s, %s, %s, %s)
                RETURNING id, created_at
            ''', (model_urn, item, descripcion, created_by))
            
            res = cursor.fetchone()
            partida_id = str(res[0])
            conn.commit()
            
            return jsonify({
                "message": "Partida Creada",
                "partida": {
                    "id": partida_id,
                    "item": item,
                    "descripcion": descripcion,
                    "precio": 0.0,
                    "incidencia": 0.0,
                    "metodologia": "",
                    "software": "",
                    "created_by": created_by
                }
            })
    except Exception as e:
        print(f"Error POST /api/partidas: {e}")
        return jsonify({"error": str(e)}), 500

@partidas_bp.route('/batch', methods=['POST'])
def create_partidas_batch():
    """Inserta múltiples partidas desde un array (Excel import)."""
    data = request.json
    model_urn = data.get('model_urn')
    partidas = data.get('partidas', [])
    created_by = data.get('created_by', 'Sistema')

    if not model_urn or not partidas:
        return jsonify({"error": "model_urn y partidas son obligatorios"}), 400

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Borrar las partidas anteriores del proyecto (opcional: o solo añadir)
            # cursor.execute('DELETE FROM doc_partidas WHERE model_urn = %s', (model_urn,))
            
            values = []
            for p in partidas:
                item = str(p.get('item', ''))[:50]
                desc = str(p.get('descripcion', ''))[:500]
                unidad = str(p.get('unidad', ''))[:50]
                metrado = float(p.get('metrado', 0.0)) if p.get('metrado') not in [None, ''] else 0.0
                pu = float(p.get('precio_unitario', 0.0)) if p.get('precio_unitario') not in [None, ''] else 0.0
                precio = float(p.get('precio', 0.0)) if p.get('precio') not in [None, ''] else 0.0
                incidencia = float(p.get('incidencia', 0.0)) if p.get('incidencia') not in [None, ''] else 0.0
                metodologia = str(p.get('metodologia', ''))[:50]
                software = str(p.get('software', ''))[:50]
                avance = float(p.get('avance', 0.0)) if p.get('avance') not in [None, ''] else 0.0
                
                values.append((model_urn, item, desc, unidad, metrado, pu, precio, incidencia, metodologia, software, avance, created_by))
            
            args_str = ','.join(cursor.mogrify("(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", x).decode('utf-8') for x in values)
            
            cursor.execute(f'''
                INSERT INTO doc_partidas (model_urn, item, descripcion, unidad, metrado, precio_unitario, precio, incidencia, metodologia, software, avance, created_by)
                VALUES {args_str}
            ''')
            
            conn.commit()
            
            return jsonify({"message": f"{len(partidas)} partidas importadas correctamente."})
    except Exception as e:
        print(f"Error POST /api/partidas/batch: {e}")
        return jsonify({"error": str(e)}), 500

@partidas_bp.route('/<partida_id>', methods=['PATCH'])
def update_partida(partida_id):
    """Actualiza campos específicos de una partida (Inline Editing)."""
    data = request.json
    if not data:
        return jsonify({"error": "No data provided"}), 400
        
    allowed_fields = ['item', 'descripcion', 'unidad', 'metrado', 'precio_unitario', 'precio', 'incidencia', 'metodologia', 'software', 'avance']
    updates = []
    values = []
    
    for key, value in data.items():
        if key in allowed_fields:
            if key in ['metrado', 'precio_unitario', 'precio', 'incidencia', 'avance']:
                updates.append(f"{key} = %s::numeric")
                values.append(value if value not in [None, ''] else 0.0)
            else:
                updates.append(f"{key} = %s")
                values.append(value)
                
    if not updates:
        return jsonify({"message": "No valid fields to update"}), 200
        
    updates.append("updated_at = CURRENT_TIMESTAMP")
    values.append(partida_id)
    
    query = f"UPDATE doc_partidas SET {', '.join(updates)} WHERE id = %s RETURNING id"
    
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, tuple(values))
            if cursor.fetchone():
                conn.commit()
                return jsonify({"message": "Updated successfully"})
            else:
                return jsonify({"error": "Partida not found"}), 404
    except Exception as e:
        print(f"Error PATCH /api/partidas: {e}")
        return jsonify({"error": str(e)}), 500

@partidas_bp.route('/<partida_id>', methods=['DELETE'])
def delete_partida(partida_id):
    """Elimina una partida."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM doc_partidas WHERE id = %s RETURNING id', (partida_id,))
            if cursor.fetchone():
                conn.commit()
                return jsonify({"message": "Deleted successfully"})
            else:
                return jsonify({"error": "Partida not found"}), 404
    except Exception as e:
        print(f"Error DELETE /api/partidas: {e}")
        return jsonify({"error": str(e)}), 500

@partidas_bp.route('/all/<path:model_urn>', methods=['DELETE'])
def delete_all_partidas(model_urn):
    """Elimina todas las partidas de un proyecto."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM doc_partidas WHERE model_urn = %s', (model_urn,))
            conn.commit()
            return jsonify({"message": "Todas las partidas fueron eliminadas exitosamente."})
    except Exception as e:
        print(f"Error DELETE /api/partidas/all: {e}")
        return jsonify({"error": str(e)}), 500

