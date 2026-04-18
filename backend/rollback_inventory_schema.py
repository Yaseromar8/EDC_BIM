import os
import psycopg2
from dotenv import load_dotenv

# Cargar variables de entorno (asumiendo que corre en backend/)
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

def rollback_inventory():
    try:
        conn = psycopg2.connect(
            host=os.getenv('DB_HOST', 'localhost'),
            database=os.getenv('DB_NAME', 'postgres'),
            user=os.getenv('DB_USER', 'postgres'),
            password=os.getenv('DB_PASS', '')
        )
        conn.autocommit = True
        cursor = conn.cursor()

        print("[Rollback] Revirtiendo inventory_assets...")
        cursor.execute("TRUNCATE TABLE inventory_assets;")

        try:
            cursor.execute("ALTER TABLE inventory_assets DROP CONSTRAINT IF EXISTS inventory_assets_composite_key;")
        except: pass

        try:
            cursor.execute("ALTER TABLE inventory_assets DROP COLUMN IF EXISTS source_urn;")
        except: pass

        print("[Rollback] Restaurando restricción original de external_id...")
        cursor.execute("ALTER TABLE inventory_assets ADD CONSTRAINT inventory_assets_external_id_key UNIQUE (external_id);")

        print("[Rollback] Éxito. Base de datos revertida a su estado original.")

    except Exception as e:
        print(f"[Error] {e}")
    finally:
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()

if __name__ == '__main__':
    rollback_inventory()
