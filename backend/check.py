from db import init_db_pool, get_db_connection
from dotenv import load_dotenv

load_dotenv()
init_db_pool()

with get_db_connection() as conn:
    cursor = conn.cursor()
    cursor.execute("SELECT item, metrado, precio, incidencia, avance FROM doc_partidas WHERE item LIKE '01.%' LIMIT 5")
    for r in cursor.fetchall():
        print(r)
