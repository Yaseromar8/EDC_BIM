import sys
import json
from dotenv import load_dotenv
load_dotenv('.env')
sys.path.append('backend')
from routes.tracking import get_tracking_data
from db import get_db_connection

model_urn = '1_CANAL'
try:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        new_data = {
            "fotos": [
                {
                    "id": "test-pin-1",
                    "pin_type": "fotos",
                    "x": 0, "y": 0, "z": 0,
                    "photos": [
                        {
                            "id": "test-photo",
                            "name": "test.jpg",
                            "url": "http://localhost:3000/api/docs/proxy?urn=abc",
                            "gcs_urn": "abc"
                        }
                    ]
                }
            ]
        }
        
        # Copied from tracking.py _upsert_pin
        for pin_item in new_data['fotos']:
            pin_id = pin_item.get('id')
            x = pin_item.get('x')
            y = pin_item.get('y')
            z = pin_item.get('z')
            val = pin_item.get('val')
            color = pin_item.get('color')
            extra = {k: v for k, v in pin_item.items() if k not in ('id', 'x', 'y', 'z', 'val', 'color', '_element')}
            
            cursor.execute('''
                INSERT INTO tracking_pins (id, pin_type, x, y, z, val, color, data, model_urn, specialty)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    x = EXCLUDED.x, y = EXCLUDED.y, z = EXCLUDED.z,
                    val = EXCLUDED.val, color = EXCLUDED.color, data = EXCLUDED.data,
                    model_urn = EXCLUDED.model_urn, specialty = EXCLUDED.specialty
            ''', (pin_id, 'fotos', x, y, z, val, color, json.dumps(extra, default=str), model_urn, pin_item.get('specialty', 'General')))
            
            for photo in pin_item.get('photos', []):
                cursor.execute('''
                    INSERT INTO photo_evidences (pin_id, gcs_url, filename, model_urn)
                    VALUES (%s, %s, %s, %s)
                ''', (pin_id, photo.get('url', ''), photo.get('name', 'photo.jpg'), model_urn))
        conn.commit()
        print('SUCCESS')
except Exception as e:
    print('ERROR:', e)
