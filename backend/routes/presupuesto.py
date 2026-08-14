"""
Rutas API para el Presupuesto Maestro (BIM 5D)
================================================
GET  /api/presupuesto/<model_urn>              -> Árbol completo del presupuesto
POST /api/presupuesto/import                   -> Importar Excel del presupuesto
POST /api/presupuesto/import-json              -> Importar desde JSON (fallback)
"""
from esquema_congelado import solo_con_ddl
from flask import Blueprint, jsonify, request
from db import get_db_connection, resolve_project_id
import json
import os
from perimetro_de_obra import guardia_de_obra

presupuesto_bp = Blueprint('presupuesto_bp', __name__)

# -------------------------------------------------------------------
# SQL para crear la tabla
# -------------------------------------------------------------------
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS presupuesto_maestro (
    id SERIAL PRIMARY KEY,
    model_urn TEXT NOT NULL,
    item TEXT NOT NULL,
    descripcion TEXT,
    unidad TEXT,
    metrado_contractual NUMERIC,
    precio_unitario NUMERIC,
    parcial_contractual NUMERIC,
    nivel INTEGER NOT NULL DEFAULT 1,
    es_titulo BOOLEAN NOT NULL DEFAULT FALSE,
    parent_item TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(model_urn, item)
);
CREATE INDEX IF NOT EXISTS idx_presupuesto_model_urn ON presupuesto_maestro(model_urn);
CREATE INDEX IF NOT EXISTS idx_presupuesto_parent ON presupuesto_maestro(parent_item);
CREATE INDEX IF NOT EXISTS idx_presupuesto_item ON presupuesto_maestro(item);
"""

@solo_con_ddl
def ensure_presupuesto_schema():
    """Crea la tabla presupuesto_maestro si no existe."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(CREATE_TABLE_SQL)
            conn.commit()
            print("[Presupuesto] Tabla presupuesto_maestro verificada OK")
    except Exception as e:
        print(f"[Presupuesto] Error creando tabla: {e}")


# -------------------------------------------------------------------
# GET /api/presupuesto/<model_urn> - Obtener árbol completo
# -------------------------------------------------------------------
@presupuesto_bp.route('/<path:model_urn>', methods=['GET'])
def get_presupuesto(model_urn):
    """Devuelve el presupuesto completo como árbol jerárquico."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, item, descripcion, unidad, metrado_contractual, 
                       precio_unitario, parcial_contractual, nivel, es_titulo, parent_item
                FROM presupuesto_maestro
                WHERE model_urn = %s
                ORDER BY item ASC
            ''', (model_urn,))
            
            rows = []
            for r in cursor.fetchall():
                rows.append({
                    "id": r[0],
                    "item": r[1] or "",
                    "descripcion": r[2] or "",
                    "unidad": r[3] or "",
                    "metrado_contractual": float(r[4]) if r[4] is not None else None,
                    "precio_unitario": float(r[5]) if r[5] is not None else None,
                    "parcial_contractual": float(r[6]) if r[6] is not None else None,
                    "nivel": r[7],
                    "es_titulo": r[8],
                    "parent_item": r[9]
                })
            
            return jsonify({"results": rows, "total": len(rows)})
    except Exception as e:
        print(f"Error GET /api/presupuesto: {e}")
        return jsonify({"error": str(e)}), 500


# -------------------------------------------------------------------
# POST /api/presupuesto/import - Importar desde Excel
# -------------------------------------------------------------------
@presupuesto_bp.route('/import', methods=['POST'])
def import_presupuesto_excel():
    """Importa el presupuesto desde un archivo Excel subido."""
    data = request.get_json() or {}
    model_urn = data.get('model_urn')
    negativa = guardia_de_obra(model_urn, 'importar el presupuesto')
    if negativa:
        return negativa
    if not model_urn:
        return jsonify({"error": "model_urn es obligatorio"}), 400
    
    # Usar el Excel del proyecto
    excel_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'Presupuesto_Rv01.xlsx')
    if not os.path.exists(excel_path):
        return jsonify({"error": f"No se encuentra el archivo Excel: {excel_path}"}), 404
    
    try:
        from import_presupuesto import parse_presupuesto_excel, insert_presupuesto, create_table
        
        rows = parse_presupuesto_excel(excel_path)
        
        with get_db_connection() as conn:
            create_table(conn)
            count = insert_presupuesto(conn, model_urn, rows)
        
        return jsonify({"message": f"{count} filas importadas correctamente", "total": count})
    except Exception as e:
        print(f"Error POST /api/presupuesto/import: {e}")
        return jsonify({"error": str(e)}), 500


# -------------------------------------------------------------------
# POST /api/presupuesto/import-json - Importar desde JSON (fallback)
# -------------------------------------------------------------------
@presupuesto_bp.route('/import-json', methods=['POST'])
def import_presupuesto_json():
    """Importa el presupuesto desde el JSON pre-generado."""
    data = request.get_json() or {}
    model_urn = data.get('model_urn')
    negativa = guardia_de_obra(model_urn, 'importar el presupuesto')
    if negativa:
        return negativa
    if not model_urn:
        return jsonify({"error": "model_urn es obligatorio"}), 400
    
    json_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'presupuesto_maestro.json')
    if not os.path.exists(json_path):
        return jsonify({"error": "No se encuentra presupuesto_maestro.json. Ejecute import_presupuesto.py primero."}), 404
    
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            rows = json.load(f)
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(CREATE_TABLE_SQL)
            
            # Limpiar anteriores
            cursor.execute("DELETE FROM presupuesto_maestro WHERE model_urn = %s", (model_urn,))
            
            from psycopg2.extras import execute_values
            _pid = resolve_project_id(model_urn)
            insert_sql = """
                INSERT INTO presupuesto_maestro
                    (model_urn, item, descripcion, unidad, metrado_contractual, precio_unitario, parcial_contractual, nivel, es_titulo, parent_item, project_id)
                VALUES %s
            """
            records = [
                (model_urn, r['item'], r['descripcion'], r['unidad'],
                 r['metrado_contractual'], r['precio_unitario'], r['parcial_contractual'],
                 r['nivel'], r['es_titulo'], r['parent_item'], _pid)
                for r in rows
            ]
            execute_values(cursor, insert_sql, records)
            conn.commit()
        
        return jsonify({"message": f"{len(rows)} filas importadas desde JSON", "total": len(rows)})
    except Exception as e:
        print(f"Error POST /api/presupuesto/import-json: {e}")
        return jsonify({"error": str(e)}), 500
