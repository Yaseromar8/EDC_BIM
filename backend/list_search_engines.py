from google.cloud import discoveryengine_v1beta as discoveryengine
import os

PROJECT_ID = "correos-gmail-425301"
LOCATION = "global"

# Specify the path to your service account key file
key_path = "c:/Users/omars/OneDrive/Desktop/VISOR_APS_TL/backend/gcp_sa.json"
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = key_path

def list_data_stores():
    client = discoveryengine.DataStoreServiceClient()
    parent = f"projects/{PROJECT_ID}/locations/{LOCATION}/collections/default_collection"
    
    print(f"Listing Data Stores in {parent}...")
    request = discoveryengine.ListDataStoresRequest(parent=parent)
    page_result = client.list_data_stores(request=request)
    
    for response in page_result:
        print(f"Data Store Name: {response.name}")
        print(f"Data Store ID: {response.name.split('/')[-1]}")
        print(f"Display Name: {response.display_name}")
        print("-" * 20)

def list_search_engines():
    client = discoveryengine.EngineServiceClient()
    parent = f"projects/{PROJECT_ID}/locations/{LOCATION}/collections/default_collection"
    
    print(f"Listing Search Engines in {parent}...")
    request = discoveryengine.ListEnginesRequest(parent=parent)
    page_result = client.list_engines(request=request)
    
    for response in page_result:
        print(f"Engine Name: {response.name}")
        print(f"Engine ID: {response.name.split('/')[-1]}")
        print(f"Display Name: {response.display_name}")
        print("-" * 20)

if __name__ == "__main__":
    try:
        list_data_stores()
        list_search_engines()
    except Exception as e:
        print(f"Error: {e}")
