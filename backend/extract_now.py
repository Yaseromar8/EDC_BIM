import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from dotenv import load_dotenv; import pathlib
load_dotenv(pathlib.Path(r'd:\VISOR_APS_TL\.env'))
from db import init_db_pool, get_db_connection
init_db_pool()

with get_db_connection() as conn:
    cur = conn.cursor()
    cur.execute("SELECT urn, app_project_id FROM model_config WHERE name ILIKE '%%004120%%'")
    r = cur.fetchone()
    urn = r[0]
    target = r[1]
    print(f'URN: {urn}')
    print(f'Target: {target}')

# Now trigger extraction
from routes.inventory import extract_metadata_task
job_id = "manual_fix_004120"
print(f"\nStarting extraction for job {job_id}...")
extract_metadata_task(urn, target, job_id)
print("Extraction complete!")
