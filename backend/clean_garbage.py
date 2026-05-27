import psycopg2
import base64

def get_base_urn(b64_urn):
    try:
        padded = b64_urn + '=' * (-len(b64_urn) % 4)
        url_safe = padded.replace('-', '+').replace('_', '/')
        decoded = base64.b64decode(url_safe).decode('utf-8')
        return decoded.split('?')[0]
    except Exception:
        return b64_urn

conn = psycopg2.connect(host='34.86.206.187', dbname='postgres', user='postgres', password='omarsancheZ85*', port='5432')
cur = conn.cursor()

# Get all unique source_urns and their model_urns
cur.execute("SELECT DISTINCT model_urn, source_urn FROM inventory_assets")
rows = cur.fetchall()

# Group by base_urn
grouped = {}
for model_urn, source_urn in rows:
    base_urn = get_base_urn(source_urn)
    if base_urn not in grouped:
        grouped[base_urn] = []
    grouped[base_urn].append((model_urn, source_urn))

deleted_count = 0

for base_urn, items in grouped.items():
    if len(items) > 1:
        def extract_version(item):
            u = item[1]
            try:
                padded = u + '=' * (-len(u) % 4)
                url_safe = padded.replace('-', '+').replace('_', '/')
                decoded = base64.b64decode(url_safe).decode('utf-8')
                if '?version=' in decoded:
                    return int(decoded.split('?version=')[1])
                return 0
            except:
                return 0
                
        # Sort by version number
        items.sort(key=extract_version, reverse=True)
        latest_item = items[0]
        old_items = items[1:]
        
        print(f"Base: {base_urn}")
        print(f"  Keeping: {latest_item[1]} (v{extract_version(latest_item)}) in {latest_item[0]}")
        
        for old_model_urn, old_urn in old_items:
            print(f"  Deleting: {old_urn} from {old_model_urn}")
            cur.execute("DELETE FROM inventory_assets WHERE model_urn = %s AND source_urn = %s", (old_model_urn, old_urn))
            deleted_count += cur.rowcount

conn.commit()
cur.close()
conn.close()

print(f"Cleaned up {deleted_count} duplicate rows from postgres!")
