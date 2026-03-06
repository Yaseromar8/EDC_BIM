
import psycopg2
import os

def check_db():
    try:
        conn = psycopg2.connect(
            user='postgres',
            password='omarsancheZ85*',
            host='34.86.206.187',
            port='5432',
            database='postgres'
        )
        cur = conn.cursor()
        print("Buscando archivo en DB...")
        cur.execute("SELECT name, gcs_urn FROM file_nodes WHERE name ILIKE '%001008_C01%' LIMIT 5;")
        rows = cur.fetchall()
        if not rows:
            print("No se encontró el archivo en la tabla file_nodes.")
        for r in rows:
            print(f"Archivo: {r[0]}, GCS URN: {r[1]}")
            
        print("\nBuscando en pins...")
        # Check if there is a pins table or tracking table
        cur.execute("SELECT id, name, details FROM activity_log WHERE entity_id LIKE '%17724312%' OR details::text LIKE '%17724312%' LIMIT 3;")
        for r in cur.fetchall():
            print(f"Activity Log: {r}")
            
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    check_db()
