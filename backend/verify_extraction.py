from db import get_db_connection

def verify_data():
    conn = get_db_connection()
    if not conn:
        print("Could not connect to database")
        return
        
    try:
        cur = conn.cursor()
        print("--- DATABASE EXTRACTION VERIFICATION ---")
        
        # 1. Models in the registry vs properties table
        cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
        tables = [r[0] for r in cur.fetchall()]
        
        if 'file_nodes' in tables:
            cur.execute("SELECT id, name, model_urn FROM file_nodes WHERE model_urn IS NOT NULL")
            nodes = cur.fetchall()
            print("\n1. Models tracked in file_nodes:")
            for node in nodes:
                print(f"   - {node[1]} (URN: {node[2]})")
                
        if 'inventario' in tables:
            cur.execute("SELECT model_urn, COUNT(*) FROM inventario GROUP BY model_urn")
            inv_counts = cur.fetchall()
            print("\n2. Elements extracted in 'inventario' table:")
            if not inv_counts:
                 print("   [EMPTY]")
            for c in inv_counts:
                print(f"   - URN {c[0]}: {c[1]} elements")
                
        if 'elements' in tables:
            cur.execute("SELECT model_urn, COUNT(*) FROM elements GROUP BY model_urn")
            elements_counts = cur.fetchall()
            print("\n3. Elements extracted in 'elements' table (new schema):")
            if not elements_counts:
                 print("   [EMPTY]")
            for c in elements_counts:
                print(f"   - URN {c[0]}: {c[1]} elements")
                
    except Exception as e:
        print(f"Error checking DB: {e}")
    finally:
        conn.close()

if __name__ == '__main__':
    verify_data()
