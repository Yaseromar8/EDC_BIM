import os
import requests
import shutil
import subprocess
import zipfile
from pathlib import Path
from dotenv import load_dotenv

# Load env
load_dotenv('d:/VISOR_APS_TL/.env')
client_id = os.environ.get('APS_CLIENT_ID')
client_secret = os.environ.get('APS_CLIENT_SECRET')

# Nickname is usually the Client ID in Design Automation
nickname = client_id
DEFAULT_AUTOCAD_ENGINE = "Autodesk.AutoCAD+26_0"
PREFERRED_CIVIL_ENGINE = os.environ.get("APS_DA_ENGINE", "Autodesk.Civil3D+26_0")

BASE_DIR = Path(__file__).resolve().parent
PROJECT_PATH = BASE_DIR / "AlignmentExtractorApp.csproj"
BUNDLE_DIR = BASE_DIR / "AlignmentExtractorApp.bundle"
CONTENTS_DIR = BUNDLE_DIR / "Contents"
RELEASE_DIR = BASE_DIR / "bin" / "Release" / "net8.0-windows"
ZIP_PATH = BASE_DIR / "AlignmentExtractorApp.zip"

def get_token():
    url = 'https://developer.api.autodesk.com/authentication/v2/token'
    data = {
        'client_id': client_id,
        'client_secret': client_secret,
        'grant_type': 'client_credentials',
        'scope': 'code:all data:write data:read bucket:create bucket:read'
    }
    r = requests.post(url, data=data)
    r.raise_for_status()
    return r.json()['access_token']

def choose_engine(engines):
    """Use Civil 3D when available; fall back to AutoCAD with Civil support."""
    if PREFERRED_CIVIL_ENGINE in engines:
        return PREFERRED_CIVIL_ENGINE

    civil_engines = [e for e in engines if 'civil' in e.lower()]
    if civil_engines:
        same_series = [e for e in civil_engines if '+26_0' in e]
        return same_series[0] if same_series else civil_engines[-1]

    if DEFAULT_AUTOCAD_ENGINE in engines:
        print(f"WARNING: Civil 3D engine not found. Falling back to {DEFAULT_AUTOCAD_ENGINE}.")
        return DEFAULT_AUTOCAD_ENGINE

    raise RuntimeError(f"No compatible Design Automation engine found. Engines: {engines}")

def build_bundle_zip():
    print("0.1 Building local AppBundle DLL...")
    subprocess.run(["dotnet", "build", str(PROJECT_PATH), "-c", "Release"], check=True)

    CONTENTS_DIR.mkdir(parents=True, exist_ok=True)
    for pattern in ("AlignmentExtractorApp.dll", "AlignmentExtractorApp.deps.json", "AlignmentExtractorApp.pdb"):
        src = RELEASE_DIR / pattern
        if src.exists():
            shutil.copy2(src, CONTENTS_DIR / src.name)

    if ZIP_PATH.exists():
        ZIP_PATH.unlink()

    print("0.2 Packaging AppBundle ZIP...")
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for item in BUNDLE_DIR.rglob("*"):
            if item.is_file():
                zip_file.write(item, item.relative_to(BUNDLE_DIR))

    return ZIP_PATH

def deploy():
    zip_path = build_bundle_zip()

    token = get_token()
    headers = {'Authorization': f'Bearer {token}'}
    da_url = 'https://developer.api.autodesk.com/da/us-east/v3'
    
    print("0. Fetching engines...")
    engines = []
    url = f"{da_url}/engines"
    while url:
        r_eng = requests.get(url, headers=headers).json()
        engines.extend(r_eng.get('data', []))
        url = f"{da_url}/engines?page={r_eng['paginationToken']}" if r_eng.get('paginationToken') else None
    
    civil_engines = [e for e in engines if 'civil' in e.lower()]
    print(f"Civil 3D Engines found: {civil_engines}")
    engine_id = choose_engine(engines)
    print(f"Using Design Automation engine: {engine_id}")
    
    app_name = 'AlignmentExtractorApp'
    
    print("1. Creating AppBundle...")
    app_bundle_id = f"{nickname}.{app_name}+prod"
    
    # 1.1 Try to delete if exists
    requests.delete(f"{da_url}/appbundles/{app_name}", headers=headers)
    
    # 1.2 Create AppBundle
    bundle_data = {
        "id": app_name,
        "engine": engine_id,
        "description": "Extracts alignments to JSON"
    }
    r = requests.post(f"{da_url}/appbundles", headers=headers, json=bundle_data)
    if r.status_code not in [200, 201]:
        print(r.text)
        return
    upload_params = r.json()['uploadParameters']
    
    print("2. Uploading ZIP...")
    formData = upload_params['formData']
    with open(zip_path, 'rb') as zip_file:
        files = {'file': zip_file}
        r_up = requests.post(upload_params['endpointURL'], data=formData, files=files)
    if r_up.status_code not in [200, 201, 204]:
        print(f"Upload failed: {r_up.status_code}")
        print(r_up.text)
        return
        
    print("3. Creating AppBundle Alias 'prod'...")
    alias_data = {"id": "prod", "version": 1}
    r = requests.post(f"{da_url}/appbundles/{app_name}/aliases", headers=headers, json=alias_data)
    print("AppBundle deployed successfully!")
    
    print("4. Creating Activity...")
    act_name = "ExtractAlignmentActivity"
    requests.delete(f"{da_url}/activities/{act_name}", headers=headers)
    
    activity_data = {
        "id": act_name,
        "commandLine": [
            f"$(engine.path)\\\\accoreconsole.exe /i \"$(args[HostDwg].path)\" /al \"$(appbundles[{app_name}].path)\" /s \"$(settings[script].path)\""
        ],
        "parameters": {
            "HostDwg": {
                "verb": "get",
                "description": "Input DWG",
                "required": True,
                "localName": "HostDwg.dwg"
            },
            "Result": {
                "verb": "put",
                "description": "Output JSON",
                "localName": "alignment.json",
                "required": True
            }
        },
        "settings": {
            "script": {
                "value": "netload\n\"$(appbundles[AlignmentExtractorApp].path)\\\\Contents\\\\AlignmentExtractorApp.dll\"\nHelloWorld\nExtractCurvesJSON\n"
            }
        },
        "engine": engine_id,
        "appbundles": [app_bundle_id],
        "description": "Extracts Civil 3D alignment curves to JSON using ExtractAlignmentApp"
    }
    
    r = requests.post(f"{da_url}/activities", headers=headers, json=activity_data)
    if r.status_code not in [200, 201]:
        print(r.text)
        return
        
    print("5. Creating Activity Alias 'prod'...")
    r = requests.post(f"{da_url}/activities/{act_name}/aliases", headers=headers, json=alias_data)
    
    print(f"Deployment Complete for Alignment! Activity ID: {nickname}.{act_name}+prod")

    print("6. Creating Section Activity...")
    sec_act_name = "ExtractSectionsActivity"
    requests.delete(f"{da_url}/activities/{sec_act_name}", headers=headers)
    
    sec_activity_data = {
        "id": sec_act_name,
        "commandLine": [
            f"$(engine.path)\\\\accoreconsole.exe /i \"$(args[HostDwg].path)\" /al \"$(appbundles[{app_name}].path)\" /s \"$(settings[script].path)\""
        ],
        "parameters": {
            "HostDwg": {
                "verb": "get",
                "description": "Input DWG",
                "required": True,
                "localName": "HostDwg.dwg"
            },
            "Params": {
                "verb": "get",
                "description": "Filtro de ejes curados (params.json opcional)",
                "localName": "params.json",
                "required": False
            },
            "Result": {
                "verb": "put",
                "description": "Output Sections JSON",
                "localName": "section_result.json",
                "required": True
            }
        },
        "settings": {
            "script": {
                "value": "netload\n\"$(appbundles[AlignmentExtractorApp].path)\\\\Contents\\\\AlignmentExtractorApp.dll\"\nHelloWorld\nExtractSectionsJSON\n"
            }
        },
        "engine": engine_id,
        "appbundles": [app_bundle_id],
        "description": "Extracts Civil 3D Cross Sections to JSON"
    }
    
    r_sec = requests.post(f"{da_url}/activities", headers=headers, json=sec_activity_data)
    if r_sec.status_code not in [200, 201]:
        print(r_sec.text)
        return
        
    print("7. Creating Section Activity Alias 'prod'...")
    r_sec_alias = requests.post(f"{da_url}/activities/{sec_act_name}/aliases", headers=headers, json=alias_data)
    
    print(f"Deployment Complete for Sections! Activity ID: {nickname}.{sec_act_name}+prod")

if __name__ == '__main__':
    deploy()
