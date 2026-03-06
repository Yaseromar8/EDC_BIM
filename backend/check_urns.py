from db import get_db_connection
with get_db_connection() as conn:
    cursor = conn.cursor()
    cursor.execute("SELECT model_urn, COUNT(*) FROM file_nodes WHERE is_deleted = FALSE AND node_type = 'FILE' GROUP BY model_urn")
    rows = cursor.fetchall()
    for row in rows:
        print(f"URN: {row[0]}, Count: {row[1]}")
    
    cursor.execute("SELECT name, model_urn FROM file_nodes WHERE is_deleted = FALSE AND node_type = 'FILE' LIMIT 10")
    print("\nSample files:")
    for row in cursor.fetchall():
        print(f"- {row[0]} (URN: {row[1]})")
