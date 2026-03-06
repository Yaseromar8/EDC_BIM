import os
from dotenv import load_dotenv
import pathlib
import sys

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

load_dotenv()

from gcs_manager import generate_signed_url

path = "proyectos/01_DRENAJE_URBANO/01_PLANOS/01_ESTUDIO_DEFINITIVO/01_SECTOR_07/04_HIDRAULICA/500125-I-7-P-02-004-Rev-0.pdf"
url = generate_signed_url(path)

if url:
    print(f"SUCCESS: {url}")
else:
    print("FAILED to generate signed URL")
