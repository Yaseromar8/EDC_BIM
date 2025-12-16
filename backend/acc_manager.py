
import json
import requests
import base64
from aps import get_internal_token, APS_DATA_URL

class AccManager:
    def __init__(self):
        pass

    def _get_headers(self, token):
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    def list_folder_contents(self, project_id, folder_id):
        token, error = get_internal_token()
        if error: return None, error
        
        url = f'{APS_DATA_URL}/data/v1/projects/{project_id}/folders/{folder_id}/contents'
        resp = requests.get(url, headers=self._get_headers(token))
        if not resp.ok:
            return None, f"Error {resp.status_code}: {resp.text}"
            
        return resp.json().get('data', []), None

    def find_item_in_folder(self, project_id, folder_id, filename):
        items, error = self.list_folder_contents(project_id, folder_id)
        if error: return None, error
        
        for item in items:
            if item['attributes']['displayName'] == filename:
                return item, None
        return None, None

    def get_json_data(self, project_id, item_id):
        token, error = get_internal_token()
        if error: return None, error
        
        # 1. Get Tip Version
        url = f'{APS_DATA_URL}/data/v1/projects/{project_id}/items/{item_id}/tip'
        resp = requests.get(url, headers=self._get_headers(token))
        if not resp.ok: return None, resp.text
        
        tip_data = resp.json()['data']
        # version_id = tip_data['id']
        
        # 2. Get Signed URL for storage location? 
        # Actually, for JSON we can just download it.
        # But Data Management API doesn't give direct download link easily for BIM docs, but for generic files it might.
        # We need the 'storage' relationship.
        
        # Let's try getting the version details
        version_id = tip_data['id']
        headers = self._get_headers(token)
        
        # Get storage location
        v_url = f'{APS_DATA_URL}/data/v1/projects/{project_id}/versions/{version_id}'
        v_resp = requests.get(v_url, headers=headers)
        if not v_resp.ok: return None, v_resp.text
        
        v_data = v_resp.json()['data']
        storage_urn = v_data['relationships']['storage']['data']['id']
        # storage_urn likes "urn:adsk.objects:os.object:wip.dm.prod/..."
        
        # 3. Download from OSS
        # Extract bucket and object key from storage_urn
        # Format: urn:adsk.objects:os.object:BUCKET_KEY/OBJECT_KEY
        parts = storage_urn.split('/')
        # This is a bit hacky, standard way is to use the href if provided, but DM usually provides OSS URN.
        # Let's use the 'download' relationship if it exists (usually for derivatives).
        # For source file, we use OSS.
        
        # Basic parsing
        try:
            # remove "urn:adsk.objects:os.object:" prefix
            full_key = storage_urn.replace("urn:adsk.objects:os.object:", "")
            bucket_key = full_key.split('/')[0]
            object_key = '/'.join(full_key.split('/')[1:])
        except:
            return None, "Invalid storage URN format"
            
        # Download
        oss_url = f'https://developer.api.autodesk.com/oss/v2/buckets/{bucket_key}/objects/{object_key}'
        # Need pure binary download
        down_resp = requests.get(oss_url, headers={'Authorization': f'Bearer {token}'})
        
        if not down_resp.ok:
            return None, down_resp.text
            
        try:
            return down_resp.json(), None
        except:
            return None, "File content is not valid JSON"

    def upload_json_data(self, project_id, folder_id, filename, json_content):
        token, error = get_internal_token()
        if error: return None, error
        
        # Convert to bytes
        file_data = json.dumps(json_content, indent=2).encode('utf-8')
        
        # Check if item exists
        existing_item, _ = self.find_item_in_folder(project_id, folder_id, filename)
        
        # 1. Create Storage Object (OSS)
        # We need to know the bucket for the project? 
        # DM API: POST projects/:project_id/storage
        storage_url = f'{APS_DATA_URL}/data/v1/projects/{project_id}/storage'
        payload = {
            "jsonapi": {"version": "1.0"},
            "data": {
                "type": "objects",
                "attributes": {
                    "name": filename
                },
                "relationships": {
                    "target": {
                        "data": {"type": "folders", "id": folder_id}
                    }
                }
            }
        }
        
        s_resp = requests.post(storage_url, headers=self._get_headers(token), json=payload)
        if not s_resp.ok: return None, f"Storage Error: {s_resp.text}"
        
        storage_data = s_resp.json()['data']
        storage_id = storage_data['id'] 
        # Upload to the S3 signed url provided? Or use OSS directly?
        # The 'id' is the OSS URN. We upload to that.
        
        # Parse bucket/object from storage_id
        full_key = storage_id.replace("urn:adsk.objects:os.object:", "")
        bucket_key = full_key.split('/')[0]
        object_key = '/'.join(full_key.split('/')[1:])
        
        oss_url = f'https://developer.api.autodesk.com/oss/v2/buckets/{bucket_key}/objects/{object_key}'
        up_resp = requests.put(oss_url, headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}, data=file_data)
        
        if not up_resp.ok: return None, f"Upload Error: {up_resp.text}"
        
        # 2. Create Item (if new) or Version (if existing)
        if existing_item:
            # Create Version
            item_id = existing_item['id']
            v_url = f'{APS_DATA_URL}/data/v1/projects/{project_id}/items/{item_id}/versions'
            v_payload = {
                "jsonapi": {"version": "1.0"},
                "data": {
                    "type": "versions",
                    "attributes": {
                        "name": filename,
                        "extension": {"type": "versions:autodesk.bim360:File", "version": "1.0"}
                    },
                    "relationships": {
                        "item": {"data": {"type": "items", "id": item_id}},
                        "storage": {"data": {"type": "objects", "id": storage_id}}
                    }
                }
            }
            v_resp = requests.post(v_url, headers=self._get_headers(token), json=v_payload)
            if not v_resp.ok: return None, f"Version Error: {v_resp.text}"
            return v_resp.json(), None
            
        else:
            # Create Item
            i_url = f'{APS_DATA_URL}/data/v1/projects/{project_id}/items'
            i_payload = {
                "jsonapi": {"version": "1.0"},
                "data": {
                    "type": "items",
                    "attributes": {
                        "displayName": filename,
                        "extension": {"type": "items:autodesk.bim360:File", "version": "1.0"}
                    },
                    "relationships": {
                        "tip": {"data": {"type": "versions", "id": "1"}}, # Placeholder? No, structured differently
                        "parent": {"data": {"type": "folders", "id": folder_id}} # Parent folder
                    }
                },
                "included": [
                    {
                        "type": "versions",
                        "id": "1", # Reference
                        "attributes": {
                            "name": filename,
                            "extension": {"type": "versions:autodesk.bim360:File", "version": "1.0"}
                        },
                        "relationships": {
                            "storage": {"data": {"type": "objects", "id": storage_id}}
                        }
                    }
                ]
            }
            # Items creation payload is tricky.
            # Simplified:
            i_payload = {
                "jsonapi": {"version": "1.0"},
                "data": {
                    "type": "items",
                    "attributes": {
                        "displayName": filename,
                        "extension": {"type": "items:autodesk.bim360:File", "version": "1.0"}
                    },
                    "relationships": {
                        "parent": {"data": {"type": "folders", "id": folder_id}}
                    }
                },
                "included": [
                    {
                        "type": "versions",
                        "id": "1",
                        "attributes": {
                            "name": filename,
                            "extension": {"type": "versions:autodesk.bim360:File", "version": "1.0"}
                        },
                        "relationships": {
                            "storage": {"data": {"type": "objects", "id": storage_id}}
                        }
                    }
                ]
            }
            
            i_resp = requests.post(i_url, headers=self._get_headers(token), json=i_payload)
            if not i_resp.ok: return None, f"Item Error: {i_resp.text}"
            return i_resp.json(), None

    def upload_attachment(self, project_id, folder_id, filename, file_data, content_type='application/octet-stream'):
            token, error = get_internal_token()
            if error: return None, error
            
            # 1. Create Storage
            storage_url = f'{APS_DATA_URL}/data/v1/projects/{project_id}/storage'
            payload = {
                "jsonapi": {"version": "1.0"},
                "data": {
                    "type": "objects",
                    "attributes": {
                        "name": filename
                    },
                    "relationships": {
                        "target": {
                            "data": {"type": "folders", "id": folder_id}
                        }
                    }
                }
            }
            s_resp = requests.post(storage_url, headers=self._get_headers(token), json=payload)
            if not s_resp.ok: return None, f"Storage Error: {s_resp.text}"
            
            storage_id = s_resp.json()['data']['id']
            full_key = storage_id.replace("urn:adsk.objects:os.object:", "")
            bucket_key = full_key.split('/')[0]
            object_key = '/'.join(full_key.split('/')[1:])
            
            # 2. Upload Content
            oss_url = f'https://developer.api.autodesk.com/oss/v2/buckets/{bucket_key}/objects/{object_key}'
            up_resp = requests.put(oss_url, headers={'Authorization': f'Bearer {token}', 'Content-Type': content_type}, data=file_data)
            
            if not up_resp.ok: return None, f"Upload Error: {up_resp.text}"
            
            # 3. Create Item
            # We assume attachment is always new item for simplicity, or handle versioning if name collision
            # Let's check collision
            existing_item, _ = self.find_item_in_folder(project_id, folder_id, filename)
            
            if existing_item:
                # Create Version
                item_id = existing_item['id']
                v_url = f'{APS_DATA_URL}/data/v1/projects/{project_id}/items/{item_id}/versions'
                v_payload = {
                    "jsonapi": {"version": "1.0"},
                    "data": {
                        "type": "versions",
                        "attributes": {
                            "name": filename,
                            "extension": {"type": "versions:autodesk.bim360:File", "version": "1.0"}
                        },
                        "relationships": {
                            "item": {"data": {"type": "items", "id": item_id}},
                            "storage": {"data": {"type": "objects", "id": storage_id}}
                        }
                    }
                }
                v_resp = requests.post(v_url, headers=self._get_headers(token), json=v_payload)
                if not v_resp.ok: return None, f"Version Error: {v_resp.text}"
                return v_resp.json(), None
            else:
                 i_url = f'{APS_DATA_URL}/data/v1/projects/{project_id}/items'
                 i_payload = {
                    "jsonapi": {"version": "1.0"},
                    "data": {
                        "type": "items",
                        "attributes": {
                            "displayName": filename,
                            "extension": {"type": "items:autodesk.bim360:File", "version": "1.0"}
                        },
                        "relationships": {
                            "parent": {"data": {"type": "folders", "id": folder_id}}
                        }
                    },
                    "included": [
                        {
                            "type": "versions",
                            "id": "1",
                            "attributes": {
                                "name": filename,
                                "extension": {"type": "versions:autodesk.bim360:File", "version": "1.0"}
                            },
                            "relationships": {
                                "storage": {"data": {"type": "objects", "id": storage_id}}
                            }
                        }
                    ]
                }
                 i_resp = requests.post(i_url, headers=self._get_headers(token), json=i_payload)
                 if not i_resp.ok: return None, f"Item Error: {i_resp.text}"
                 return i_resp.json(), None
