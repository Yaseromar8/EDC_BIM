import os
from dotenv import load_dotenv
load_dotenv()
import psycopg2
import file_system_db

PROJECT_URN = "b.a7ce4d60-79f3-4dbf-b059-fefaf14f7b1d"

try:
    conn = psycopg2.connect(
        user=os.environ.get("DB_USER"),
        password=os.environ.get("DB_PASS"),
        host=os.environ.get("DB_HOST"),
        port=os.environ.get("DB_PORT", "5432"),
        database=os.environ.get("DB_NAME")
    )
    cursor = conn.cursor()
    
    # El nodo que usa el frontend
    frontend_id = file_system_db.resolve_path_to_node_id("proyectos/PQT8_TALARA/", PROJECT_URN)
    print(f"Frontend node ID (RAÍZ): {frontend_id}")
    
    # Obtener todos los hijos
    cursor.execute("""
        SELECT id, name, node_type
        FROM file_nodes
        WHERE parent_id = %s AND is_deleted = FALSE
    """, (frontend_id,))
    items = cursor.fetchall()
    
    # 1. Identificar las carpetas padre (GAVIONES, DISIPADOR, etc.) que empiezan con "0X "
    parent_map = {}  # prefijo '01' -> id de la carpeta padre
    import re
    
    for item_id, name, node_type in items:
        if node_type == 'FOLDER':
            match = re.match(r'^(\d{2})\s+[A-Z]', name)
            if match:
                prefix = match.group(1)
                parent_map[prefix] = item_id
                print(f"Carpeta Padre identificada: [{prefix}] {name}")
    
    # Carpetas que no deben moverse porque son raíz (ISO 19650)
    root_folders = ['01_GESTION', '02_WIP', '03_COMPARTIDO', '04_PUBLICADO', '05_SEGUIMIENTO', 
                    'GENERAL', 'Fotos_Generales', '05_Informes_Semanales', 
                    '01_Gestion_de_Proyecto', '02_Planos_Aprobados', '03_Modelos_BIM',
                    '04_Fotos_de_Campo', '06_Minutas_y_Contratos']
    
    moves_count = 0
    
    # 2. Mover las subcarpetas ("0X_...") al padre correspondiente
    print("\nProcesando movimientos...")
    for item_id, name, node_type in items:
        if node_type == 'FOLDER' and name not in root_folders:
            match = re.match(r'^(\d{2})_', name)
            if match:
                prefix = match.group(1)
                if prefix in parent_map:
                    target_parent = parent_map[prefix]
                    print(f"  Moviendo '{name}' -> Padre con prefijo [{prefix}]")
                    cursor.execute("""
                        UPDATE file_nodes
                        SET parent_id = %s
                        WHERE id = %s
                    """, (target_parent, item_id))
                    moves_count += 1
    
    # 3. Mover los archivos PDF de la raíz a una carpeta si es necesario
    # Por ahora dejaremos los PDFs en su lugar porque no sabemos exactamente dónde van,
    # aunque podríamos moverlos a '02_Planos_Aprobados' o '02_WIP'.
    
    conn.commit()
    print(f"\n¡Misión cumplida! Se movieron {moves_count} carpetas a sus ubicaciones correctas.")
    conn.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
