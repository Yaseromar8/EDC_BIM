import os
from dotenv import load_dotenv

# Forzar carga del .env en la ruta principal (VISOR_APS_TL/.env)
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(env_path)

import sys
from gcs_manager import get_storage_client
from db import get_db_connection

def test_gcs():
    print("Probando conexión a Google Cloud Storage...")
    try:
        bucket_name = os.environ.get("GCS_BUCKET_NAME")
        if not bucket_name or bucket_name == "TU_BUCKET_AQUI":
            print("❌ ERROR: GCS_BUCKET_NAME no esta configurado en .env")
            return False
            
        client = get_storage_client()
        bucket = client.bucket(bucket_name)
        # Intentar verificar si el bucket existe (requiere permiso)
        if bucket.exists():
            print(f"✅ Conexión exitosa al bucket: {bucket_name}")
            return True
        else:
            print(f"❌ ERROR: El bucket '{bucket_name}' no existe o no tienes permisos.")
            return False
    except Exception as e:
        print(f"❌ ERROR de GCS: {str(e)}")
        return False

def test_db():
    print("\nProbando conexión a PostgreSQL...")
    try:
        # get_db_connection ya usa las variables de entorno
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT version();")
            version = cursor.fetchone()
            print(f"✅ Conexión exitosa a DB. Versión: {version[0]}")
            return True
    except Exception as e:
        print(f"❌ ERROR de PostgreSQL: {str(e)}")
        return False

if __name__ == "__main__":
    print(f"Cargando variables desde: {os.path.abspath(env_path)}")
    print("-" * 40)
    
    gcs_ok = test_gcs()
    db_ok = test_db()
    
    print("-" * 40)
    if gcs_ok and db_ok:
        print("🚀 ¡TODO ESTÁ LISTO Y CONECTADO PERFECTAMENTE!")
        sys.exit(0)
    else:
        print("⚠️ HAY ERRORES. Revisa tu archivo .env y vuelve a intentar.")
        sys.exit(1)
