import os
from dotenv import load_dotenv
load_dotenv()
import psycopg2
import file_system_db

PROJECT_URN = "b.a7ce4d60-79f3-4dbf-b059-fefaf14f7b1d"

def optimize_db_and_deduplicate():
    try:
        conn = psycopg2.connect(
            user=os.environ.get("DB_USER"),
            password=os.environ.get("DB_PASS"),
            host=os.environ.get("DB_HOST"),
            port=os.environ.get("DB_PORT", "5432"),
            database=os.environ.get("DB_NAME")
        )
        cursor = conn.cursor()
        
        # 1. OPTIMIZACIÓN
        print("=== OPTIMIZANDO BASE DE DATOS PARA LECTURA RÁPIDA ===")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_file_nodes_parent_id 
            ON file_nodes (parent_id, is_deleted);
        """)
        conn.commit()
        print("Índice listo.\n")
        
        # 2. CONSOLIDACIÓN DE DUPLICADOS EN LA RAÍZ
        print("=== CONSOLIDANDO CARPETAS DUPLICADAS EN LA RAÍZ ===")
        frontend_id = file_system_db.resolve_path_to_node_id("proyectos/PQT8_TALARA/", PROJECT_URN)
        
        cursor.execute("""
            SELECT name, COUNT(*), array_agg(id::text)
            FROM file_nodes
            WHERE parent_id = %s AND is_deleted = FALSE AND node_type = 'FOLDER'
            GROUP BY name
            HAVING COUNT(*) > 1
        """, (frontend_id,))
        
        duplicates = cursor.fetchall()
        for name, count, ids_list in duplicates:
            print(f"Duplicado detectado: '{name}' ({count} copias)")
            
            # psycopg2 retorna una lista cuando se castea a id::text
            if isinstance(ids_list, str):
                ids = ids_list.strip("{}").split(",")
            else:
                ids = ids_list
                
            primary_id = ids[0]
            secondary_ids = ids[1:]
            
            for sec_id in secondary_ids:
                cursor.execute("""
                    UPDATE file_nodes
                    SET parent_id = %s
                    WHERE parent_id = %s
                """, (primary_id, sec_id))
                
                cursor.execute("""
                    UPDATE file_nodes
                    SET is_deleted = TRUE
                    WHERE id = %s
                """, (sec_id,))
            print(f"  -> Fusionadas exitosamente en el primary ID: {primary_id}")
            
        conn.commit()
        print("\nDeduplicación completa.")
        conn.close()
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    optimize_db_and_deduplicate()
