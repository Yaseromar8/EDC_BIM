import os
from dotenv import load_dotenv
load_dotenv()
import psycopg2
import unicodedata
import file_system_db

PROJECT_URN = "b.a7ce4d60-79f3-4dbf-b059-fefaf14f7b1d"

def remove_accents(input_str):
    nfkd_form = unicodedata.normalize('NFKD', input_str)
    return u"".join([c for c in nfkd_form if not unicodedata.combining(c)])

def normalize_name(name):
    # Remover acentos, pasar a mayúsculas y quitar espacios en los extremos
    name = remove_accents(name).upper().strip()
    # Casos tipográficos específicos del usuario
    if name == 'GEOT_GEOTECNIA' or name == 'GEOT_GEOTECNICA2':
        return 'GEOT_GEOTECNICA'
    if name == '3.03_INF_DE ESTUDIO_TOPOGRAFIA':
        return 'TP_TOPOGRAFIA'
    if 'EST_ESTRUCTURAS' in name:
        return 'EST_ESTRUCTURAS'
    return name

def force_deduplicate():
    try:
        conn = psycopg2.connect(
            user=os.environ.get("DB_USER"),
            password=os.environ.get("DB_PASS"),
            host=os.environ.get("DB_HOST"),
            port=os.environ.get("DB_PORT", "5432"),
            database=os.environ.get("DB_NAME")
        )
        cursor = conn.cursor()
        
        frontend_id = file_system_db.resolve_path_to_node_id("proyectos/PQT8_TALARA/", PROJECT_URN)
        print(f"Raíz PQT8_TALARA ID: {frontend_id}")
        
        cursor.execute("""
            SELECT id, name
            FROM file_nodes
            WHERE parent_id = %s AND is_deleted = FALSE AND node_type = 'FOLDER'
        """, (frontend_id,))
        
        folders = cursor.fetchall()
        
        # Agrupar por nombre normalizado
        groups = {}
        for f_id, f_name in folders:
            norm = normalize_name(f_name)
            if norm not in groups:
                groups[norm] = []
            groups[norm].append((f_id, f_name))
            
        print("\n=== GRUPOS PARA FUSIONAR ===")
        merged_count = 0
        deleted_empty_count = 0
        
        for norm_name, items in groups.items():
            if len(items) > 1:
                print(f"Fusionando grupo '{norm_name}':")
                for i in items:
                    print(f"  - {i[1]} (ID: {i[0]})")
                
                # El primario será el que no tiene tildes o el primero
                primary_item = items[0]
                # Buscar preferiblemente uno que ya tenga el nombre norm como nombre original si existe
                for i in items:
                    if i[1] == norm_name:
                        primary_item = i
                        break
                        
                primary_id = primary_item[0]
                print(f"  -> Manteniendo principal: {primary_item[1]}")
                
                # Fusionar todos los demás en el primario
                for sec_id, sec_name in items:
                    if sec_id != primary_id:
                        # Mover hijos al primario
                        cursor.execute("""
                            UPDATE file_nodes
                            SET parent_id = %s
                            WHERE parent_id = %s
                        """, (primary_id, sec_id))
                        # Eliminar el secundario
                        cursor.execute("""
                            UPDATE file_nodes
                            SET is_deleted = TRUE
                            WHERE id = %s
                        """, (sec_id,))
                        merged_count += 1
                        print(f"  -> {sec_name} movido y eliminado.")
            else:
                pass
                
        print(f"\nConsolidación finalizada: {merged_count} carpetas redundantes eliminadas.")
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    force_deduplicate()
