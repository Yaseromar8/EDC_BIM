import os
from dotenv import load_dotenv
load_dotenv()
import psycopg2

PROJECT_ID = "b.a7ce4d60-79f3-4dbf-b059-fefaf14f7b1d"

try:
    conn = psycopg2.connect(
        user=os.environ.get("DB_USER"),
        password=os.environ.get("DB_PASS"),
        host=os.environ.get("DB_HOST"),
        port=os.environ.get("DB_PORT", "5432"),
        database=os.environ.get("DB_NAME")
    )
    cursor = conn.cursor()
    
    print(f"--- ALINEACIÓN TOTAL DE IDENTIDAD A {PROJECT_ID} ---")
    cursor.execute("UPDATE file_nodes SET model_urn = %s", (PROJECT_ID,))
    print(f"Total registros alineados: {cursor.rowcount}")

    conn.commit()
    conn.close()
    print("FIN DE LA OPERACIÓN.")
except Exception as e:
    print(f"Error: {e}")
