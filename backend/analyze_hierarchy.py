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
    print(f"Frontend node ID: {frontend_id}")
    
    # Obtener TODOS los hijos directos
    cursor.execute("""
        SELECT f.id, f.name, f.node_type,
               (SELECT count(*) FROM file_nodes x WHERE x.parent_id = f.id AND x.is_deleted = FALSE) as children
        FROM file_nodes f
        WHERE f.parent_id = %s AND f.is_deleted = FALSE
        ORDER BY f.node_type DESC, f.name
    """, (frontend_id,))
    items = cursor.fetchall()
    
    print(f"\n=== TODOS LOS ÍTEMS EN RAÍZ ({len(items)}) ===")
    
    # Separar carpetas estructurales (con número+espacio) de subcarpetas (con número+guionbajo)
    structural = []  # "01 GAVION SANTA RITA" - top level component folders
    iso_folders = []  # "01_GESTION", "02_WIP" - ISO 19650 workflow folders
    sub_folders = []  # "01_AVANCE", "01_RESUMEN_EJECUTIVO" - likely subcarpetas
    auto_created = [] # "01_Gestion_de_Proyecto", "02_Planos_Aprobados" - auto-created
    
    import re
    for item_id, name, node_type, children in items:
        if node_type == 'FOLDER':
            # Patrón: "0X NOMBRE CON ESPACIOS" = carpetas estructurales de componente
            if re.match(r'^\d{2}\s+[A-Z]', name):
                structural.append((item_id, name, children))
            # Patrón: "0X_NOMBRE_SIMPLE" con pocas palabras y sin subcarpetas específicas de proyecto
            elif name in ['01_GESTION', '02_WIP', '03_COMPARTIDO', '04_PUBLICADO', '05_SEGUIMIENTO',
                          'GENERAL', 'Fotos_Generales', '05_Informes_Semanales']:
                iso_folders.append((item_id, name, children))
            # Patrón: auto-creados por el sistema
            elif name in ['01_Gestion_de_Proyecto', '02_Planos_Aprobados', '03_Modelos_BIM',
                          '04_Fotos_de_Campo', '05_Informes_Semanales', '06_Minutas_y_Contratos']:
                auto_created.append((item_id, name, children))
            else:
                sub_folders.append((item_id, name, children))
        else:
            pass  # archivos
    
    print("\n[ESTRUCTURALES - top level componentes del proyecto]:")
    for fid, name, c in structural:
        print(f"  '{name}' ({c} hijos)")
    
    print("\n[ISO 19650 - carpetas de flujo de trabajo]:")
    for fid, name, c in iso_folders:
        print(f"  '{name}' ({c} hijos)")
    
    print("\n[AUTO-CREADAS por el sistema]:")
    for fid, name, c in auto_created:
        print(f"  '{name}' ({c} hijos)")
    
    print("\n[SUBCARPETAS que probablemente pertenecen a otras]:")
    for fid, name, c in sub_folders:
        print(f"  '{name}' ({c} hijos)")
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
