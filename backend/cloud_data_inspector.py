import os
import time
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

def inspect_cloud_data():
    conn = psycopg2.connect(
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASS"),
        host=os.getenv("DB_HOST")
    )
    cur = conn.cursor()
    
    print(">>> Buscando en TODAS las tablas de ai_brain:")
    
    tables = ['semantic_triples', 'global_knowledge', 'feedback_buffer']
    keywords = ['CE.040', 'tirante', 'diámetro', 'diametro', '0.45', '0.78']
    
    for table in tables:
        print(f"\n=== Tabla: {table} ===")
        for kw in keywords:
            # We use a broad search on all columns cast to text
            query = f"SELECT * FROM ai_brain.{table} WHERE (t::text ILIKE %s)"
            # Note: The query above is generic. I'll search on specific columns if I know them.
            # For semantic_triples: subject, predicate, object, context_quote
            # For global_knowledge: fact, context, metadata
            
            if table == 'semantic_triples':
                query = "SELECT subject, value_numeric, context_quote FROM ai_brain.semantic_triples WHERE context_quote ILIKE %s OR object ILIKE %s OR subject ILIKE %s"
            elif table == 'global_knowledge':
                query = "SELECT fact, context, metadata FROM ai_brain.global_knowledge WHERE fact ILIKE %s OR context ILIKE %s"
            else:
                query = "SELECT feedback_text FROM ai_brain.feedback_buffer WHERE feedback_text ILIKE %s"
            
            cur.execute(query, (f'%{kw}%', f'%{kw}%', f'%{kw}%') if table == 'semantic_triples' else (f'%{kw}%', f'%{kw}%'))
            rows = cur.fetchall()
            if rows:
                print(f"  [MATCH] Keyword: '{kw}' | Count: {len(rows)}")
                for r in rows[:3]: # Show top 3
                    print(f"    {r}")
            
    cur.close()
    conn.close()

if __name__ == "__main__":
    inspect_cloud_data()
