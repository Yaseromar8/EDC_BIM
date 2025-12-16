
import json
import urllib.parse
from acc_manager import AccManager

# Configuration
PROJECT_ID = "b.ef954d04-cbd2-4995-a8c0-33f182067104"
CONFIG_FOLDER_URN = "urn:adsk.wipprod:fs.folder:co.ipacU4CdTuyswllaTpz_3Q"
ATTACHMENTS_FOLDER_NAME = "ADJUNTOS_PINES"

def setup():
    manager = AccManager()
    
    print(f"Setting up ACC Config...")
    print(f"Project ID: {PROJECT_ID}")
    print(f"Config Folder: {CONFIG_FOLDER_URN}")
    
    # Check for attachments folder
    print(f"Searching for '{ATTACHMENTS_FOLDER_NAME}'...")
    item, error = manager.find_item_in_folder(PROJECT_ID, CONFIG_FOLDER_URN, ATTACHMENTS_FOLDER_NAME)
    
    attachments_id = CONFIG_FOLDER_URN # Default to same folder
    
    if item:
        print(f"Found Attachments Folder: {item['id']}")
        attachments_id = item['id']
    else:
        print(f"'{ATTACHMENTS_FOLDER_NAME}' not found. Using Config Folder for attachments.")
        # Optional: We could create it here if we wanted to be fancy, but fallback is safe.

    config = {
        "project_id": PROJECT_ID,
        "config_folder_id": CONFIG_FOLDER_URN,
        "attachments_folder_id": attachments_id
    }
    
    with open('backend/acc_config.json', 'w') as f:
        json.dump(config, f, indent=2)
        
    print("Configuration saved to backend/acc_config.json")

if __name__ == "__main__":
    setup()
