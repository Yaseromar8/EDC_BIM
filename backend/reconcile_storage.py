"""
reconcile_storage.py

Script Garbage Collector (SRE)
Compara los blobs en Google Cloud Storage contra los registros en PostgreSQL.
Cualquier archivo físico en GCS que no exista en DB (ej. orfandad por servidor crasheado)
y que tenga una edad (Time Created) > 6 horas, será borrado de GCS automáticamente.
"""

import os
import sys
import datetime
import pathlib
from dotenv import load_dotenv

# Cargar variables de entorno apuntando al archivo .env local o nivel superior
_env_found = load_dotenv()
if not _env_found:
    _parent_env = pathlib.Path(__file__).resolve().parent.parent / '.env'
    load_dotenv(_parent_env)

# Importamos deps internas del backend
from gcs_manager import get_storage_client
from db import get_db_connection

GRACE_PERIOD_HOURS = 6

def run_reconciliation(dry_run=False):
    print("============================================")
    print("🚀 INICIANDO RECONCILIACIÓN GCS vs POSTGRES")
    print(f"Modo Dry-Run: {dry_run}")
    print(f"Periodo de Gracia: {GRACE_PERIOD_HOURS} horas")
    print("============================================")

    # 1. Obtener lista de URNS registrados en Base de Datos (Nodes y Versions)
    db_urns = set()
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            print("[1/4] Consultando PostgreSQL...")
            # URNS de la tabla file_nodes (versiones actuales)
            cursor.execute("SELECT gcs_urn FROM file_nodes WHERE gcs_urn IS NOT NULL")
            for row in cursor.fetchall():
                if row[0]: db_urns.add(row[0])

            # URNS de la tabla file_versions (historial de versiones)
            cursor.execute("SELECT gcs_urn FROM file_versions WHERE gcs_urn IS NOT NULL")
            for row in cursor.fetchall():
                if row[0]: db_urns.add(row[0])
                
        print(f"      - {len(db_urns)} URNs legítimos encontrados en BD.")
    except Exception as e:
        print(f"[!] ERROR FATAL conectando a PostgreSQL: {e}")
        sys.exit(1)

    # 2. Iterar sobre todos los blobs en GCS
    print("\n[2/4] Conectando a Google Cloud Storage...")
    bucket_name = os.environ.get("GCS_BUCKET_NAME")
    if not bucket_name:
        print("[!] ERROR FATAL: GCS_BUCKET_NAME no definido.")
        sys.exit(1)

    try:
        client = get_storage_client()
        bucket = client.bucket(bucket_name)
    except Exception as e:
        print(f"[!] ERROR FATAL conectando a GCS: {e}")
        sys.exit(1)

    print("\n[3/4] Analizando orfandad de Blobs...")
    blobs = bucket.list_blobs()
    
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    
    orphans_found = 0
    bytes_recovered = 0

    for blob in blobs:
        # Ignorar carpetas virtuales simuladas
        if blob.name.endswith('/'):
            continue
            
        # El nombre del blob en nuestra arquitectura a menudo equivale al gcs_urn o es [uuid]
        gcs_id = blob.name.split('/')[-1]
        
        # Para mayor robustez en la búsqueda (A veces la BD guarda el path completo y a veces solo el ID)
        raw_name = blob.name
        
        # Calcular antigüedad del blob
        age_delta = now_utc - blob.time_created
        age_hours = age_delta.total_seconds() / 3600.0

        # Chequear existencia en BD
        if gcs_id not in db_urns and raw_name not in db_urns:
            if age_hours > GRACE_PERIOD_HOURS:
                # ORPHAN MATCH (No DB record AND older than GRACE_PERIOD)
                orphans_found += 1
                bytes_recovered += blob.size
                
                size_mb = blob.size / (1024*1024)
                print(f"  [ORPHAN DETECTADO] {blob.name} (Edad: {age_hours:.1f}h) - {size_mb:.2f} MB")
                
                if not dry_run:
                    try:
                        blob.delete()
                        print(f"      -> 🗑️ BORRADO EXITOSAMENTE")
                    except Exception as e:
                        print(f"      -> ❌ ERROR BORRANDO: {e}")
            else:
                # EN PERIODO DE GRACIA (Podría ser una subida pesada en progreso por Signed URL)
                pass

    # 4. Resumen Final
    print("\n[4/4] RESUMEN DE EJECUCIÓN")
    print("--------------------------------------------")
    print(f"Blobs Huérfanos Totales Detectados: {orphans_found}")
    print(f"Almacenamiento Recuperable/Recuperado: {bytes_recovered / (1024*1024):.2f} MB")
    if dry_run:
        print("\n⚠️ Esto fue un DRY-RUN (simulación segura porque no pasaste --force).")
        print("Para eliminar definitivamente la basura física de GCS, ejecuta:")
        print("python reconcile_storage.py --force")
    else:
        print("\n✅ LIMPIEZA DEFINITIVA COMPLETADA.")

if __name__ == "__main__":
    # Verifica si pasaron el flag --force
    is_dry_run = "--force" not in sys.argv
    run_reconciliation(dry_run=is_dry_run)
