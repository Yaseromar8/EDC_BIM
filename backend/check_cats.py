import psycopg2, json
conn = psycopg2.connect(dbname='visor_aps', user='postgres', password='postgres', host='localhost', port='5432')
cur = conn.cursor()
cur.execute('SELECT name, properties FROM inventory_assets LIMIT 3')
rows = cur.fetchall()
for name, props in rows:
    p = props if isinstance(props, dict) else json.loads(props)
    print(f"=== {name} ===")
    for cat_name, cat_val in p.items():
        if isinstance(cat_val, dict):
            print(f"  [{cat_name}]")
            for k, v in list(cat_val.items())[:5]:
                print(f"    {k}: {v}")
conn.close()
