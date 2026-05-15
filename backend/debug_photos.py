import psycopg2, os, json

conn = psycopg2.connect(os.environ.get('DATABASE_URL', 'postgresql://admin:visiion2025@localhost:5432/visor_aps'))
cur = conn.cursor()
cur.execute("SELECT id, data FROM tracking_pins WHERE pin_type='fotos' ORDER BY created_at DESC LIMIT 3")
for row in cur.fetchall():
    pin_id = row[0]
    data = row[1] if isinstance(row[1], dict) else json.loads(row[1]) if row[1] else {}
    photos = data.get('photos', [])
    print(f'PIN {pin_id}: {len(photos)} photos')
    for p in photos[:3]:
        print(f'  Keys: {list(p.keys())}')
        print(f'  src: {str(p.get("src","NONE"))[:150]}')
        print(f'  url: {str(p.get("url","NONE"))[:150]}')
        print(f'  fullPath: {str(p.get("fullPath","NONE"))[:150]}')
        print(f'  gcs_urn: {str(p.get("gcs_urn","NONE"))[:150]}')
        print()
conn.close()
