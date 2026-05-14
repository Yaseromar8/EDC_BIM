import sys, json
from dotenv import load_dotenv
load_dotenv('.env')
sys.path.append('backend')
from db import get_db_connection
try:
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, pin_type, x, y, z, val, color, data FROM tracking_pins WHERE model_urn='1_CANAL' AND pin_type='fotos'")
        rows = cur.fetchall()
        for r in rows:
            print(f'ID: {r[0]}, Type: {r[1]}')
            print(f'Coords: x={r[2]}, y={r[3]}, z={r[4]}')
            print(f'Val: {r[5]}, Color: {r[6]}')
            data_col = r[7]
            if data_col:
                print(f'DATA (JSONB): {json.dumps(data_col, indent=2, default=str)}')
            else:
                print('DATA: None')
            print('---')
except Exception as e:
    print('Error:', e)
