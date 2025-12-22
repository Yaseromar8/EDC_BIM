
import json
import os

CONFIG_FILE = 'backend/digital_twin_config.json'
PINS_FILE = 'backend/pins.json'
VIEWS_FILE = 'backend/saved_views.json'

DEFAULT_PROJECT = 'DRENAJE_URBANO'

def migrate_config():
    if not os.path.exists(CONFIG_FILE): return
    with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    modified = False
    for m in data.get('models', []):
        if 'appProjectId' not in m:
            m['appProjectId'] = DEFAULT_PROJECT
            modified = True
            
    if modified:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        print("Migrated config (models)")

def migrate_pins():
    if not os.path.exists(PINS_FILE): return
    with open(PINS_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    modified = False
    for p in data:
        if 'projectId' not in p:
            p['projectId'] = DEFAULT_PROJECT
            modified = True
            
    if modified:
        with open(PINS_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        print("Migrated pins")

def migrate_views():
    if not os.path.exists(VIEWS_FILE): return
    with open(VIEWS_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    modified = False
    for v in data:
        if 'projectId' not in v:
            v['projectId'] = DEFAULT_PROJECT
            modified = True
            
    if modified:
        with open(VIEWS_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        print("Migrated views")

if __name__ == '__main__':
    migrate_config()
    migrate_pins()
    migrate_views()
