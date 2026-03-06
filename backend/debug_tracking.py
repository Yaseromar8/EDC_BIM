import os
import json
from db import get_db_connection
import dotenv

dotenv.load_dotenv(dotenv_path='../.env')

def check_tracking():
    urn = input("Enter model URN: ")
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, pin_type, data FROM tracking_pins WHERE model_urn = %s", (urn,))
            rows = cursor.fetchall()
            for r in rows:
                print(f"ID: {r[0]} | Type: {r[1]}")
                print(f"Data: {json.dumps(r[2], indent=2)}")
                print("-" * 20)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_tracking()
