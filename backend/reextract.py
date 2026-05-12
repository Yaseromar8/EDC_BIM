"""
Re-ejecutar la extracción de metadata usando la vista SCL_APS (7,563 elementos).
Invoca directamente extract_metadata_task con los parámetros del modelo.
"""
import os, sys, uuid
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from routes.inventory import extract_metadata_task, EXTRACTION_JOBS

# Parámetros del modelo (id=944 en model_config)
urn = "dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLnViMnhmakRpUkJ5YW1rTXp2Q0Q3emc_dmVyc2lvbj0yMw"
target_urn = urn  # El target URN es el mismo (modelo principal)

job_id = f"reextract-{uuid.uuid4().hex[:8]}"

print(f"=" * 80)
print(f"RE-EXTRACCIÓN DE METADATA")
print(f"=" * 80)
print(f"Job ID: {job_id}")
print(f"URN: {urn[:60]}...")
print(f"default_view_guid en DB: b93912d3-c894-765e-7d40-6b36e32a9671 (SCL_APS)")
print(f"Elementos esperados: ~7,563 hojas")
print()

# Ejecutar directamente (no en thread)
extract_metadata_task(urn, target_urn, job_id)

# Resultado
result = EXTRACTION_JOBS.get(job_id, {})
print(f"\n{'=' * 80}")
print(f"RESULTADO FINAL")
print(f"{'=' * 80}")
print(f"Status: {result.get('status')}")
print(f"Progress: {result.get('progress')}")
print(f"Message: {result.get('message')}")
