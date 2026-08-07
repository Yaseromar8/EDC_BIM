import os

with open(r'd:\VISOR_APS_TL\backend\routes\civil_design_automation.py', 'r', encoding='utf-8') as f:
    text = f.read()

start_idx = text.find('elif decoded_urn.startswith(\'urn:adsk.wipprod:fs.file:vf\')')
end_idx = text.find('            else:\n                error_reason = f"El URN decodificado')

new_block = '''elif decoded_urn.startswith('urn:adsk.wipprod:fs.file:vf') and project_id:
                # Si es de ACC, obtener la URL de storage para DA
                # ACC projects normally require the "b." prefix for data management queries, ensure it's there
                if not project_id.startswith('b.'):
                    project_id = 'b.' + project_id
                
                token_3legged = get_3legged_token() or token
                
                import urllib.parse
                
                # Check if it's an Item URN with a version query (e.g. ?version=3)
                storage_urn = None
                error_reason = None
                if '?version=' in decoded_urn:
                    item_urn, ver_str = decoded_urn.split('?version=')
                    safe_item_id = urllib.parse.quote(item_urn, safe='')
                    
                    # Fetch all versions for this item
                    versions_url = f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/items/{safe_item_id}/versions"
                    v_resp = requests.get(versions_url, headers={'Authorization': f'Bearer {token_3legged}'})
                    
                    if v_resp.ok:
                        v_data = v_resp.json()
                        # Find the version that matches ver_str
                        for v in v_data.get('data', []):
                            if str(v.get('attributes', {}).get('versionNumber')) == ver_str:
                                storage_urn = v['relationships']['storage']['data']['id']
                                break
                        if not storage_urn and v_data.get('data'):
                            # Fallback to the latest version if the exact number isn't found
                            storage_urn = v_data['data'][0]['relationships']['storage']['data']['id']
                    else:
                        print(f"[Design Automation] Error fetching versions: {v_resp.text}")
                        error_reason = f"Error al obtener versions de ACC: {v_resp.status_code}"
                else:
                    # It's already a version URN or tip URN
                    safe_version_id = urllib.parse.quote(decoded_urn, safe='')
                    version_url = f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/versions/{safe_version_id}"
                    v_resp = requests.get(version_url, headers={'Authorization': f'Bearer {token_3legged}'})
                    if v_resp.ok:
                        v_data = v_resp.json()
                        storage_urn = v_data['data']['relationships']['storage']['data']['id']
                    else:
                        print(f"[Design Automation] Error fetching version: {v_resp.text}")
                        error_reason = f"Error al obtener version de ACC: {v_resp.status_code}"
                        
                if storage_urn:
                    # Construct OSS URL
                    # storage_urn is like urn:adsk.objects:os.object:wip.dm.prod/xxxx.dwg
                    if storage_urn.startswith('urn:adsk.objects:os.object:'):
                        parts = storage_urn.replace('urn:adsk.objects:os.object:', '').split('/')
                        bucket = parts[0]
                        obj = parts[1]
                        input_url = f"https://developer.api.autodesk.com/oss/v2/buckets/{bucket}/objects/{obj}"
                        
                        # Save output to our own app's bucket instead to avoid ACC permissions issues
                        from routes.digital_twin import get_app_bucket_key
                        my_bucket = get_app_bucket_key()
                        output_url = f"https://developer.api.autodesk.com/oss/v2/buckets/{my_bucket}/objects/alignment_result.json"
                    else:
                        error_reason = f"Storage URN no soportado: {storage_urn}"
                else:
                    if not error_reason:
                        error_reason = "Storage URN no encontrado"
'''

new_text = text[:start_idx] + new_block + text[end_idx:]
with open(r'd:\VISOR_APS_TL\backend\routes\civil_design_automation.py', 'w', encoding='utf-8') as f:
    f.write(new_text)
print('Done!')
