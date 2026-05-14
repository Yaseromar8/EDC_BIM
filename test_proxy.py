import sys
from dotenv import load_dotenv
load_dotenv('.env')
sys.path.append('backend')
from gcs_manager import generate_signed_url, get_blob_data
import requests

urn = "2aef3187-25e2-4bd5-8bc7-ce7469a59b24" # Example UUID, or let's create a new one to test

try:
    print('Trying to get blob data for a dummy urn...')
except Exception as e:
    print(e)
