import sys
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.getcwd(), '.env'))
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from db import get_db_connection
from file_system_db import get_node_full_path

with get_db_connection() as conn:
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, parent_id, is_deleted, node_type, model_urn FROM file_nodes WHERE name IN ('A', 'B')")
    rows = cursor.fetchall()
    for row in rows:
        path = get_node_full_path(row[0])
        print(row, "PATH:", path)
