with open(r'd:\VISOR_APS_TL\backend\routes\civil_design_automation.py', 'r', encoding='utf-8') as f:
    text = f.read()
    
# Find the start and end of the ACC block
start_idx = text.find('elif decoded_urn.startswith(\'urn:adsk.wipprod:fs.file:vf\') and project_id:')
end_idx = text.find('            else:\n                error_reason = f"El URN decodificado no es de un bucket OSS estándar')

if end_idx == -1:
    end_idx = text.find('            else:\n                error_reason = f"El URN decodificado')

new_block = '''elif decoded_urn.startswith('urn:adsk.wipprod:fs.file:vf') and project_id:
                # Si es de ACC, obtener la URL de storage para DA
                # ACC projects normally require the "b." prefix for data management queries, ensure it's there
                if not project_id.startswith('b.'):
                    project_id = 'b.' + project_id
                
                token_3legged = get_3legged_token() or token
                
                import urllib.parse
                
                # The viewer sometimes appends ?version=X to the Version URN. We can just strip it.
                clean_version_urn = decoded_urn.split('?')[0] if '?' in decoded_urn else decoded_urn
                
                safe_version_id = urllib.parse.quote(clean_version_urn, safe='')
                version_url = f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/versions/{safe_version_id}"
                
                v_resp = requests.get(version_url, headers={'Authorization': f'Bearer {token_3legged}'})
                storage_urn = None
                if v_resp.ok:
                    v_data = v_resp.json()
                    storage_urn = v_data.get('data', {}).get('relationships', {}).get('storage', {}).get('data', {}).get('id')
                else:
                    error_reason = f"Error al obtener version de ACC: {v_resp.status_code} - {v_resp.text}"
                    print(f"[Design Automation] {error_reason}")
                
                if storage_urn:
                    if storage_urn.startswith('urn:adsk.objects:os.object:'):
                        parts = storage_urn.replace('urn:adsk.objects:os.object:', '').split('/')
                        bucket = parts[0]
                        obj = parts[1]
                        
                        # Generate a signed S3 download URL for Design Automation to avoid token issues
                        safe_obj = urllib.parse.quote(obj, safe='')
                        sign_url = f"https://developer.api.autodesk.com/oss/v2/buckets/{bucket}/objects/{safe_obj}/signeds3download?minutesExpiration=60"
                        sign_resp = requests.get(
                            sign_url,
                            headers={'Authorization': f'Bearer {token_3legged}'}
                        )
                        if sign_resp.ok:
                            input_url = sign_resp.json().get('url')
                        else:
                            # Fallback to direct OSS url if signed URL fails
                            input_url = f"https://developer.api.autodesk.com/oss/v2/buckets/{bucket}/objects/{safe_obj}"
                        
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
print("Done!")
