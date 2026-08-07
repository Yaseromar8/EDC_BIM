import os, time, requests
from dotenv import load_dotenv

load_dotenv('d:/VISOR_APS_TL/.env')
client_id = os.environ.get('APS_CLIENT_ID')
client_secret = os.environ.get('APS_CLIENT_SECRET')
limit_processing_time_sec = int(os.environ.get('APS_DA_LIMIT_PROCESSING_TIME_SEC', '7200'))

def get_token():
    r = requests.post('https://developer.api.autodesk.com/authentication/v2/token', data={
        'client_id': client_id, 'client_secret': client_secret,
        'grant_type': 'client_credentials', 'scope': 'code:all data:write data:read bucket:create bucket:read'
    })
    return r.json()['access_token']

token = get_token()
headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
da_url = 'https://developer.api.autodesk.com/da/us-east/v3'

project_id = 'b.3fcc21c3-6d58-45bb-8057-ab3352b1b58f'
item_id = 'urn:adsk.wipprod:fs.file:vf.ObeAFnUCR3-FBJ8fqA7sIQ'

# Get versions
r = requests.get(f'https://developer.api.autodesk.com/data/v1/projects/{project_id}/items/{item_id}/versions', headers=headers)
versions_data = r.json()

for v in versions_data.get('data', []):
    vid = v.get('id', '')
    if 'version=3' in vid:
        storage_data = v.get('relationships', {}).get('storage', {}).get('data', {})
        storage_id = storage_data.get('id', '') if storage_data else ''
        print(f"Found version 3, storage: {storage_id}")
        
        if storage_id:
            # Parse storage URN: urn:adsk.objects:os.object:bucket/objectKey
            parts = storage_id.split(':', 3)
            bucket_and_obj = parts[3] if len(parts) > 3 else ''
            slash_idx = bucket_and_obj.index('/')
            bucket_key_s = bucket_and_obj[:slash_idx]
            object_key = bucket_and_obj[slash_idx+1:]
            
            print(f"Bucket: {bucket_key_s}")
            print(f"Object: {object_key}")
            
            # Get signed download URL
            r_sign = requests.post(
                f'https://developer.api.autodesk.com/oss/v2/buckets/{bucket_key_s}/objects/{object_key}/signeds3download',
                headers=headers, json={}
            )
            if r_sign.status_code == 200:
                input_url = r_sign.json().get('url', '')
                print(f"Got input download URL: {bool(input_url)}")
            else:
                print(f"Failed: {r_sign.status_code} {r_sign.text}")
                exit()
            
            # Create output bucket
            out_bucket = f'da-test-{client_id.lower()[:8]}'
            requests.post('https://developer.api.autodesk.com/oss/v2/buckets', headers=headers, json={
                'bucketKey': out_bucket, 'policyKey': 'transient'
            })
            
            # Create output signed URL  
            r_out = requests.post(
                f'https://developer.api.autodesk.com/oss/v2/buckets/{out_bucket}/objects/alignment_test.json/signeds3upload',
                headers=headers, json={}
            )
            if r_out.status_code in [200, 201]:
                output_url = r_out.json().get('urls', [None])[0]
                print(f"Got output upload URL: {bool(output_url)}")
            else:
                print(f"Output URL failed: {r_out.status_code} {r_out.text}")
                exit()
            
            # Submit WorkItem
            activity_id = f'{client_id}.ExtractAlignmentActivity+prod'
            workitem_data = {
                "activityId": activity_id,
                "limitProcessingTimeSec": limit_processing_time_sec,
                "arguments": {
                    "HostDwg": {
                        "verb": "get",
                        "url": input_url
                    },
                    "Result": {
                        "verb": "put",
                        "url": output_url
                    }
                }
            }
            
            print(f"\nSubmitting WorkItem with activity: {activity_id}")
            r_wi = requests.post(f'{da_url}/workitems', headers=headers, json=workitem_data)
            print(f"WorkItem response: {r_wi.status_code}")
            wi_result = r_wi.json()
            wi_id = wi_result.get('id')
            print(f"WorkItem ID: {wi_id}")
            
            if not wi_id:
                print(f"Error: {wi_result}")
                exit()
            
            # Poll for result
            for i in range(30):
                time.sleep(5)
                r_status = requests.get(f'{da_url}/workitems/{wi_id}', headers=headers)
                status_data = r_status.json()
                status = status_data.get('status')
                print(f"  [{i*5}s] Status: {status}")
                
                if status not in ['pending', 'inprogress']:
                    report_url = status_data.get('reportUrl')
                    if report_url:
                        rep = requests.get(report_url)
                        lines = rep.text.split('\n')
                        for line in lines:
                            l = line.strip()
                            if any(kw in l.upper() for kw in ['COMMAND', 'UNKNOWN', 'ERROR', 'HELLO', 'FATAL', 'EXCEPTION', 'ASSEMBLY', 'CIVIL', 'ALIGNMENT', 'SCRIPT']):
                                print(f"  REPORT: {l}")
                    break
        break
