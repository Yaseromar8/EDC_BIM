"""Trigger re-extraction directly (bypassing API auth)"""
import os, sys
sys.path.insert(0, '.')

# Load env
with open('../.env') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ[k] = v

from routes.inventory import extract_metadata_task

urn = 'dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLnViMnhmakRpUkJ5YW1rTXp2Q0Q3emc_dmVyc2lvbj0yMw'
target = '1_CANAL'
job_id = 'manual_reextract_st'

print(f"Disparando extraccion para modelo estructural...")
print(f"URN: ...{urn[-30:]}")
print(f"Target: {target}")
print(f"Job ID: {job_id}")

extract_metadata_task(urn, target, job_id)

print("\n=== DONE ===")
