import psycopg2
import os

# Credenciales de d:/VISOR_APS_TL/.env
DB_USER="postgres"
DB_PASS="omarsancheZ85*"
DB_NAME="postgres"
DB_HOST="34.86.206.187"
DB_PORT="5432"

try:
    conn = psycopg2.connect(
        user=DB_USER,
        password=DB_PASS,
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        connect_timeout=10
    )
    cursor = conn.cursor()
    print("Conexión exitosa a la base de datos.")
    
    cursor.execute("SELECT model_urn, COUNT(*) FROM file_nodes GROUP BY model_urn;")
    rows = cursor.fetchall()
    print("\nModel URN Counts in file_nodes:")
    for row in rows:
        print(f" - {row[0]}: {row[1]}")
        
    cursor.execute("SELECT name, model_urn, node_type FROM file_nodes WHERE parent_id IS NULL AND is_deleted = FALSE;")
    rows = cursor.fetchall()
    print("\nRoot Nodes (parent_id IS NULL):")
    for row in rows:
        print(f" - {row[0]} ({row[2]}) [URN: {row[1]}]")
        
    # Verificar PQT8_TALARA específicamente
    cursor.execute("SELECT id, name, model_urn FROM file_nodes WHERE name ILIKE '%PQT8_TALARA%' AND is_deleted = FALSE;")
    rows = cursor.fetchall()
    print("\nNodes matching 'PQT8_TALARA':")
    for row in rows:
        print(f" - ID: {row[0]}, Name: {row[1]}, URN: {row[2]}")
        # Ver hijos de este nodo
        cursor.execute("SELECT name, node_type FROM file_nodes WHERE parent_id = %s AND is_deleted = FALSE;", (row[0],))
        children = cursor.fetchall()
        print(f"   Children count: {len(children)}")
        for child in children:
            print(f"     - {child[0]} ({child[1]})")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
