import os
from dotenv import load_dotenv
load_dotenv()
import psycopg2
import file_system_db

PROJECT_ID = "b.a7ce4d60-79f3-4dbf-b059-fefaf14f7b1d"
PATH = "proyectos/PQT8_TALARA/"

NAMES = [
    '01_GESTION', '02_WIP', '03_COMPARTIDO', '04_PUBLICADO', '05_Informes_Semanales', 
    '05_SEGUIMIENTO', 'Acta_Constitucion_PQT8_v01', 'Acta_Designacion_Gerente_Proyectos', 
    'Acta_Reunion_Inicio_Proyecto', 'Analisis_Riesgos_PQT8', 'Cronograma_Maestro_v01', 
    'Fotos_Generales', 'GENERAL', 'Listado_Stakeholders', 'Matriz_Comunicaciones', 
    'Plan_Gestion_Calidad', 'Plan_Gestion_Costos_v01', 'Propuesta_Tecnica_Original'
]

try:
    conn = psycopg2.connect(
        user=os.environ.get("DB_USER"),
        password=os.environ.get("DB_PASS"),
        host=os.environ.get("DB_HOST"),
        port=os.environ.get("DB_PORT", "5432"),
        database=os.environ.get("DB_NAME")
    )
    cursor = conn.cursor()
    
    # 1. Resolver el MASTER ID
    master_id = file_system_db.resolve_path_to_node_id(PATH, PROJECT_ID)
    print(f"MASTER ID: {master_id}")
    
    # 2. Forzar cada uno de los 18 nombres a ser hijo del MASTER si existen
    print("--- CONCATENACIÓN FORZADA DE 18 ELEMENTOS ---")
    count = 0
    for name in NAMES:
        cursor.execute("""
            UPDATE file_nodes 
            SET parent_id = %s, model_urn = %s, is_deleted = FALSE 
            WHERE name = %s
        """, (master_id, PROJECT_ID, name))
        if cursor.rowcount > 0:
            print(f" [+] Rescatado: {name} ({cursor.rowcount} registros)")
            count += 1
        else:
            print(f" [-] No encontrado: {name}")

    conn.commit()
    
    # 3. Verificación final de la API a través del script
    cursor.execute("SELECT count(*) FROM file_nodes WHERE parent_id = %s AND is_deleted = FALSE", (master_id,))
    final_count = cursor.fetchone()[0]
    print(f"VALIDACIÓN FINAL: {final_count} elementos bajo Talara.")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
