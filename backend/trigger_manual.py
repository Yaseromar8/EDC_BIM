import os
import sys
from dotenv import load_dotenv

load_dotenv('d:/VISOR_APS_TL/.env')
sys.path.append('d:/VISOR_APS_TL/backend/routes')
sys.path.append('d:/VISOR_APS_TL/backend')

from inventory import extract_metadata_task

urns = [
    "dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLkJ4RkxyZi1vU1F5YWtnZ3B3YmdLNGc_dmVyc2lvbj0zNw",
    "dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLnJyV05tX28zUlhLWFJsNlZGdzQ5ZGc_dmVyc2lvbj02",
    "dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLnpWOE5LU2pzVDRxcUxLQ2plUm1pSEE_dmVyc2lvbj0xMQ",
    "dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLkRDZE43cktaUTZDQ3NvSnhsaXJKS3c_dmVyc2lvbj02",
    "dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLno4cDRVU3NBUnZHRkpjLXNLenVvSXc_dmVyc2lvbj03"
]

for i, urn in enumerate(urns):
    print(f"[{i+1}/{len(urns)}] Manual extraction for {urn[:30]}...")
    extract_metadata_task(urn, "1_DRENAJE", f"manual_job_{i}")

print("All extractions triggered/completed.")
