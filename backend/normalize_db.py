import os
from dotenv import load_dotenv
load_dotenv('../.env')
from db import get_db_connection

with get_db_connection() as conn:
    cursor = conn.cursor()
    print('Updating file_nodes...')
    cursor.execute("UPDATE file_nodes SET model_urn = RTRIM(model_urn, '/') WHERE model_urn LIKE '%/'")
    print(f'Rows updated in file_nodes: {cursor.rowcount}')
    
    print('Updating activity_log...')
    cursor.execute("UPDATE activity_log SET model_urn = RTRIM(model_urn, '/') WHERE model_urn LIKE '%/'")
    print(f'Rows updated in activity_log: {cursor.rowcount}')
    
    conn.commit()
    print('DONE.')
