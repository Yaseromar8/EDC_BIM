import os
from dotenv import load_dotenv
load_dotenv()
import psycopg2
import file_system_db

PROJECT_URN = "b.a7ce4d60-79f3-4dbf-b059-fefaf14f7b1d"

def rollback_auto_classify_and_final_dedupe():
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
        
        # 1. UNDO AUTO-CLASSIFY: Mover de vuelta a la raíz todas las subcarpetas que moví
        print("=== REVERTIENDO CLASIFICACIÓN AUTOMÁTICA ===")
        # Buscar todas las carpetas que auto_classify.py metió dentro de los Gaviones
        # auto_classify movió las que empezaban con "0X_" hacia adentro de "0X "
        
        # Obtener los Gaviones (las carpetas que empiezan con "0X ") en la raíz
        cursor.execute("""
            SELECT id FROM file_nodes 
            WHERE parent_id = %s AND node_type = 'FOLDER' AND name ~ '^\d{2}\s+[A-Z]'
        """, (frontend_id,))
        gaviones = [r[0] for r in cursor.fetchall()]
        
        restored_count = 0
        if gaviones:
            for g_id in gaviones:
                # Obtener los hijos (las carpetas 0X_ y archivos)
                cursor.execute("""
                    SELECT id, name FROM file_nodes
                    WHERE parent_id = %s
                """, (g_id,))
                for child_id, child_name in cursor.fetchall():
                    # Mover a la raíz absoluta
                    cursor.execute("""
                        UPDATE file_nodes SET parent_id = %s WHERE id = %s
                    """, (frontend_id, child_id))
                    restored_count += 1
                    print(f"  Devuelto a la raíz: '{child_name}'")
        
        print(f"Total devueltos a la raíz: {restored_count}")
        
        # 2. SEGUNDA PASADA DE DEDUPLICACIÓN EXTREMA
        import unicodedata
        import re
        
        def normalize_name(name):
            # Remover acentos
            nfkd_form = unicodedata.normalize('NFKD', name)
            n = u"".join([c for c in nfkd_form if not unicodedata.combining(c)])
            # Mayúsculas y quitar espacios
            n = n.upper().strip()
            # Remapeos duros por typos
            if n in ['GEOT_GEOTECNIA', 'GEOT_GEOTECNICA2', 'GEOT_GEOLOGÍA', 'GEOT_GEOLOGIA']:
                return 'GEOT_GEOTECNICA'
            if n in ['HIDR_HIDRAULICA', 'HIDR_HIDRÁULICA']:
                return 'HIDR_HIDRAULICA'
            if 'EST_ESTRUCTURAS' in n:
                return 'EST_ESTRUCTURAS'
            return n

        print("\n=== DEDUPLICACIÓN DE SEGUNDA PASADA EXTREMA ===")
        cursor.execute("""
            SELECT id, name
            FROM file_nodes
            WHERE parent_id = %s AND is_deleted = FALSE AND node_type = 'FOLDER'
        """, (frontend_id,))
        folders = cursor.fetchall()
        
        groups = {}
        for f_id, f_name in folders:
            norm = normalize_name(f_name)
            if norm not in groups:
                groups[norm] = []
            groups[norm].append((f_id, f_name))
            
        merged_count = 0
        for norm_name, items in groups.items():
            if len(items) > 1:
                print(f"Agrupados '{norm_name}': {[name for _, name in items]}")
                # Tomar el primero como primario
                primary_id = items[0][0]
                
                for sec_id, sec_name in items[1:]:
                    # Mover los hijos del secundario al primario
                    cursor.execute("""
                        UPDATE file_nodes SET parent_id = %s WHERE parent_id = %s
                    """, (primary_id, sec_id))
                    
                    # Eliminar secundario
                    cursor.execute("""
                        UPDATE file_nodes SET is_deleted = TRUE WHERE id = %s
                    """, (sec_id,))
                    merged_count += 1
                    print(f"  -> Eliminado/fusionado duplicado: {sec_name}")
                    
        print(f"\nTotal carpetas duplicadas eliminadas: {merged_count}")
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    rollback_auto_classify_and_final_dedupe()
