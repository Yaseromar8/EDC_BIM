"""
HOTFIX: restaura model_config.project_id (ACC Project ID) que el backfill de
identidad piso con la obra '1'.

Fuente de verdad: digital_twin_config.json (respaldo local con projectId ACC por
modelo). Match por model_id; para filas sin entrada en el JSON, usa el ACC id
unanime del respaldo (todos los modelos pertenecen al mismo proyecto ACC).

Idempotente y verificable: imprime antes/despues.
"""
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pathlib
from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).resolve().parent.parent / '.env')
load_dotenv()
from db import init_db_pool, get_db_connection

init_db_pool()

backup = json.load(open(pathlib.Path(__file__).parent / 'digital_twin_config.json', encoding='utf-8'))
acc_by_model_id = {m['id']: m['projectId'] for m in backup['models'] if m.get('projectId')}
acc_values = set(acc_by_model_id.values())
unanimous = acc_values.pop() if len(acc_values) == 1 else None
print(f"[Restore] Respaldo: {len(acc_by_model_id)} modelos, ACC unanime: {unanimous}")

with get_db_connection() as conn:
    cur = conn.cursor()
    cur.execute("SELECT model_id, name, project_id FROM model_config")
    rows = cur.fetchall()
    fixed = 0
    for model_id, name, current in rows:
        target = acc_by_model_id.get(model_id) or unanimous
        if not target:
            print(f"  !! sin ACC id para {name} — saltado")
            continue
        if current != target:
            cur.execute("UPDATE model_config SET project_id = %s WHERE model_id = %s", (target, model_id))
            fixed += 1
    conn.commit()

    cur.execute("SELECT project_id, COUNT(*) FROM model_config GROUP BY project_id")
    print(f"[Restore] Filas corregidas: {fixed}. Estado final: {cur.fetchall()}")
