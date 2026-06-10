"""
Migración: copia la data de USUARIO desde inventory_assets hacia la nueva tabla
asset_user_data (patrón 'column family z' de Autodesk Tandem), anclada por external_id.

Qué copia:
  - installation_status  -> status
  - material             -> material
  - vaciado_nro          -> vaciado_nro
  - properties->'Live Edit' (campos custom: Costo, Notas, Proveedor, Fase...) -> extras

Garantías:
  - SEGURO: solo CREA la tabla y COPIA datos. NUNCA modifica ni borra inventory_assets.
  - IDEMPOTENTE: re-ejecutable sin duplicar (ON CONFLICT DO NOTHING).
  - DEDUPE: si un external_id existe en varias versiones, toma la fila mas reciente.

Uso:
  cd backend && python migrate_asset_user_data.py
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import pathlib
from dotenv import load_dotenv
# Cargar .env de la raiz del proyecto y, como respaldo, del CWD
load_dotenv(pathlib.Path(__file__).resolve().parent.parent / '.env')
load_dotenv()

from db import init_db_pool, get_db_connection, ensure_asset_user_data_table


def migrate():
    init_db_pool()
    ensure_asset_user_data_table()

    with get_db_connection() as conn:
        cur = conn.cursor()

        # 1. Contar filas de inventory_assets que tienen data de usuario
        cur.execute("""
            SELECT COUNT(*) FROM inventory_assets
            WHERE installation_status IS NOT NULL
               OR material IS NOT NULL
               OR vaciado_nro IS NOT NULL
               OR (properties ? 'Live Edit')
        """)
        candidatos = cur.fetchone()[0]
        print(f"[Migracion] Filas con data de usuario en inventory_assets: {candidatos}")

        if candidatos == 0:
            print("[Migracion] No hay nada que copiar. inventory_assets no tiene ediciones de usuario.")
            return

        # 2. Copiar a asset_user_data (dedupe por external_id, version mas reciente gana)
        cur.execute("""
            INSERT INTO asset_user_data (external_id, model_urn, status, material, vaciado_nro, extras, updated_at)
            SELECT DISTINCT ON (external_id)
                external_id,
                model_urn,
                installation_status,
                material,
                vaciado_nro,
                COALESCE(properties->'Live Edit', '{}'::jsonb),
                COALESCE(last_updated, NOW())
            FROM inventory_assets
            WHERE installation_status IS NOT NULL
               OR material IS NOT NULL
               OR vaciado_nro IS NOT NULL
               OR (properties ? 'Live Edit')
            ORDER BY external_id, last_updated DESC NULLS LAST
            ON CONFLICT (external_id) DO NOTHING
        """)
        copiados = cur.rowcount
        conn.commit()

        # 3. Verificar
        cur.execute("SELECT COUNT(*) FROM asset_user_data")
        total = cur.fetchone()[0]
        print(f"[Migracion] Filas insertadas en esta corrida: {copiados}")
        print(f"[Migracion] Total en asset_user_data: {total}")
        print("[Migracion] OK. inventory_assets quedo INTACTO como respaldo.")


if __name__ == '__main__':
    migrate()
