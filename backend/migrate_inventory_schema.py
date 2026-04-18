import os
import psycopg2
from dotenv import load_dotenv

# Cargar variables de entorno (asumiendo que corre en backend/)
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

def migrate_inventory():
    try:
        conn = psycopg2.connect(
            host=os.getenv('DB_HOST', 'localhost'),
            database=os.getenv('DB_NAME', 'postgres'),
            user=os.getenv('DB_USER', 'postgres'),
            password=os.getenv('DB_PASS', '')
        )
        conn.autocommit = True
        cursor = conn.cursor()

        print("[Migración] Iniciando actualización de inventory_assets...")

        # 1. Vaciar la tabla para evitar conflictos con la nueva restricción única
        print("[Migración] 1. Vaciando tabla inventory_assets...")
        cursor.execute("TRUNCATE TABLE inventory_assets;")

        # 2. Eliminar la restricción de external_id única y antigua
        print("[Migración] 2. Eliminando restricción anterior (inventory_assets_external_id_key)...")
        try:
            cursor.execute("ALTER TABLE inventory_assets DROP CONSTRAINT IF EXISTS inventory_assets_external_id_key;")
        except Exception as e:
            print(f"Aviso al intentar borrar constraint: {e}")

        # 3. Agregar la nueva columna source_urn si no existe
        print("[Migración] 3. Agregando columna source_urn...")
        cursor.execute("ALTER TABLE inventory_assets ADD COLUMN IF NOT EXISTS source_urn VARCHAR(255);")

        # 4. Crear la nueva restricción compuesta
        print("[Migración] 4. Creando restricción única compuesta (model_urn, source_urn, external_id)...")
        cursor.execute("""
            ALTER TABLE inventory_assets 
            ADD CONSTRAINT inventory_assets_composite_key UNIQUE (model_urn, source_urn, external_id);
        """)

        print("[Migración] ¡Éxito! El esquema de la base de datos ha sido purgado y actualizado para soportar Hard Wipes multi-modelo.")

    except Exception as e:
        print(f"[Error de Migración] {e}")
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

if __name__ == '__main__':
    migrate_inventory()
