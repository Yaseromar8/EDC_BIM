import psycopg2, sys, json, base64
sys.stdout.reconfigure(encoding='utf-8')

conn = psycopg2.connect(host='34.86.206.187', dbname='postgres', user='postgres', password='omarsancheZ85*', port='5432')
cur = conn.cursor()

# Buscar por la descripción que tiene el typo "MATERAIL" o el nombre exacto
cur.execute("""
    SELECT name, external_id, source_urn, properties->'__category__'->>'__category__' as cat
    FROM inventory_assets 
    WHERE properties::text LIKE '%%MATERAIL DE PRESTAMO%%'
    ORDER BY external_id
""")
results = cur.fetchall()
print(f"=== Elementos con 'MATERAIL DE PRESTAMO' ===")
print(f"Total encontrados: {len(results)}")

by_urn = {}
for name, ext_id, src_urn, cat in results:
    if src_urn not in by_urn:
        by_urn[src_urn] = []
    by_urn[src_urn].append((ext_id, name))

for urn, items in by_urn.items():
    try:
        padded = urn + '=' * (-len(urn) % 4)
        url_safe = padded.replace('-', '+').replace('_', '/')
        decoded = base64.b64decode(url_safe).decode('utf-8')
    except:
        decoded = urn[:60]
    print(f"\n  URN: {decoded}")
    print(f"  Cantidad: {len(items)}")
    print(f"  Ejemplos: {items[:10]}")

cur.close(); conn.close()
