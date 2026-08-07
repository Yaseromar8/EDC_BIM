import os

with open(r'd:\VISOR_APS_TL\backend\routes\civil_design_automation.py', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace the input_url generation
old_input = '''                    if storage_urn.startswith('urn:adsk.objects:os.object:'):
                        parts = storage_urn.replace('urn:adsk.objects:os.object:', '').split('/')
                        bucket = parts[0]
                        obj = parts[1]
                        input_url = f"https://developer.api.autodesk.com/oss/v2/buckets/{bucket}/objects/{obj}"
                        
                        # Save output to our own app's bucket instead to avoid ACC permissions issues
                        from routes.digital_twin import get_app_bucket_key
                        my_bucket = get_app_bucket_key()
                        output_url = f"https://developer.api.autodesk.com/oss/v2/buckets/{my_bucket}/objects/alignment_result.json"'''

new_input = '''                    if storage_urn.startswith('urn:adsk.objects:os.object:'):
                        parts = storage_urn.replace('urn:adsk.objects:os.object:', '').split('/')
                        bucket = parts[0]
                        obj = parts[1]
                        
                        # Generate a signed S3 download URL for Design Automation to avoid token issues
                        safe_obj = urllib.parse.quote(obj, safe='')
                        sign_resp = requests.get(
                            f"https://developer.api.autodesk.com/oss/v2/buckets/{bucket}/objects/{safe_obj}/signeds3download?minutesExpiration=60",
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
                        output_url = f"https://developer.api.autodesk.com/oss/v2/buckets/{my_bucket}/objects/alignment_result.json"'''

if old_input in text:
    text = text.replace(old_input, new_input)
    
# We also need to remove the HostDwg Authorization header if it's a signed URL
old_workitem = '''        workitem_payload = {
            "activityId": activity_id,
            "arguments": {
                "HostDwg": {
                    "url": input_url,
                    "headers": {
                        "Authorization": f"Bearer {download_token}"
                    }
                },'''

new_workitem = '''        
        # If input_url is a signed S3 url, it doesn't need an Authorization header.
        # It's an AWS URL if it contains 's3.amazonaws.com'
        host_dwg_arg = { "url": input_url }
        if 's3.amazonaws.com' not in input_url:
            host_dwg_arg["headers"] = { "Authorization": f"Bearer {download_token}" }

        workitem_payload = {
            "activityId": activity_id,
            "arguments": {
                "HostDwg": host_dwg_arg,'''

if old_workitem in text:
    text = text.replace(old_workitem, new_workitem)

with open(r'd:\VISOR_APS_TL\backend\routes\civil_design_automation.py', 'w', encoding='utf-8') as f:
    f.write(text)

print('Done!')
