import sys
import os
from db import get_db_connection

def find_docs_folder():
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, parent_id FROM file_nodes WHERE name LIKE '%03_DOCUMENTOS%' OR name = 'DOCUMENTOS' LIMIT 5;")
        rows = cursor.fetchall()
        print(f"Folders found: {rows}")
        
        for row in rows:
            cursor.execute("SELECT id, name, gcs_urn FROM file_nodes WHERE parent_id = %s LIMIT 10;", (row[0],))
            files = cursor.fetchall()
            print(f"Files in {row[1]}: {files}")

if __name__ == "__main__":
    find_docs_folder()
