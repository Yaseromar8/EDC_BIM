"""Diagnóstico temporal: inspeccionar estructura JSONB de inventory_assets"""
from flask import Blueprint, jsonify
from db import get_db_connection
import json

diag_bp = Blueprint('diagnostics', __name__)

@diag_bp.route('/api/diag/inventory-sample', methods=['GET'])
def inventory_sample():
    """Retorna 3 elementos con su estructura de propiedades completa para inspección"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT name, external_id, properties 
                FROM inventory_assets 
                LIMIT 3
            """)
            rows = cursor.fetchall()
            
            results = []
            for name, ext_id, props in rows:
                p = props if isinstance(props, dict) else json.loads(props)
                # Mostrar: claves raíz, y para cada clave, si es dict mostrar sus sub-claves
                structure = {}
                for key, val in p.items():
                    if isinstance(val, dict):
                        structure[key] = {
                            "_type": "GROUP",
                            "_count": len(val),
                            "_keys": list(val.keys())[:10],
                            "_sample": {k: str(v)[:80] for k, v in list(val.items())[:5]}
                        }
                    else:
                        structure[key] = {
                            "_type": type(val).__name__,
                            "_value": str(val)[:100]
                        }
                
                results.append({
                    "name": name,
                    "external_id": ext_id,
                    "property_groups": list(p.keys()),
                    "structure": structure
                })
            
            return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
