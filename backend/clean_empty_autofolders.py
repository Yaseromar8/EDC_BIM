import os
from dotenv import load_dotenv
load_dotenv()
import psycopg2

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
    
    # Lista de carpetas que el backend autogenera y que el usuario no quiere
    auto_folders = [
        '01_Gestion_de_Proyecto', 
        '02_Planos_Aprobados', 
        '03_Modelos_BIM',
        '04_Fotos_de_Campo', 
        '05_Informes_Semanales', 
        '06_Minutas_y_Contratos'
    ]
    
    print("=== LIMPIANDO CARPETAS AUTOGENERADAS VACÍAS ===")
    
    deleted_count = 0
    for folder_name in auto_folders:
        # Buscar en la BD la carpeta con ese nombre
        cursor.execute("SELECT id FROM file_nodes WHERE name = %s AND is_deleted = FALSE", (folder_name,))
        rows = cursor.fetchall()
        for r in rows:
            folder_id = r[0]
            # Verificar si tiene hijos
            cursor.execute("SELECT count(*) FROM file_nodes WHERE parent_id = %s AND is_deleted = FALSE", (folder_id,))
            children = cursor.fetchone()[0]
            if children == 0:
                print(f"Eliminando '{folder_name}' (vacía)")
                cursor.execute("UPDATE file_nodes SET is_deleted = TRUE WHERE id = %s", (folder_id,))
                deleted_count += 1
            else:
                print(f"Manteniendo '{folder_name}' (tiene {children} hijos)")
    
    conn.commit()
    print(f"\nSe eliminaron {deleted_count} carpetas autogeneradas vacías.")
    conn.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
