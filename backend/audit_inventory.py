import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

def check_db_state():
    try:
        conn = psycopg2.connect(
            host=os.getenv('DB_HOST', 'localhost'),
            database=os.getenv('DB_NAME', 'postgres'),
            user=os.getenv('DB_USER', 'postgres'),
            password=os.getenv('DB_PASS', '')
        )
        cursor = conn.cursor()

        print("--- ESTADO ACTUAL DE INVENTORY_ASSETS ---")
        
        # 1. Contar total de registros
        cursor.execute("SELECT COUNT(*) FROM inventory_assets;")
        total = cursor.fetchone()[0]
        print(f"Total de registros: {total}")

        # 2. Contar por model_urn
        cursor.execute("SELECT model_urn, COUNT(*) FROM inventory_assets GROUP BY model_urn;")
        print("\nRegistros por Frente (model_urn):")
        for row in cursor.fetchall():
            print(f"  - {row[0]}: {row[1]} elementos")

        # 3. Revisar columnas actuales (para confirmar rollback)
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'inventory_assets';
        """)
        cols = [r[0] for r in cursor.fetchall()]
        print(f"\nColumnas activas: {', '.join(cols)}")

    except Exception as e:
        print(f"Error inspeccionando DB: {e}")
    finally:
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()

if __name__ == '__main__':
    check_db_state()
