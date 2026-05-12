import json
from db import get_db_connection

with get_db_connection() as conn:
    cur = conn.cursor()
    cur.execute(
        "SELECT external_id, name, material, installation_status, model_urn, source_urn, properties "
        "FROM inventory_assets WHERE name ILIKE %s LIMIT 10",
        ('%Suelo%4591284%',)
    )
    rows = cur.fetchall()
    
    if not rows:
        # Intentar busqueda más amplia solo por "Suelo"
        cur.execute(
            "SELECT external_id, name, material, installation_status, model_urn, source_urn "
            "FROM inventory_assets WHERE name ILIKE %s LIMIT 20",
            ('%Suelo%',)
        )
        rows2 = cur.fetchall()
        print(f"No se encontro 'Suelo [4591284]'. Busqueda amplia 'Suelo': {len(rows2)} resultados")
        for r in rows2:
            print(f"  ext_id={r[0]}  name={r[1]}  model_urn={r[4]}")
    else:
        for r in rows:
            print("=" * 80)
            print(f"external_id : {r[0]}")
            print(f"name        : {r[1]}")
            print(f"material    : {r[2]}")
            print(f"status      : {r[3]}")
            print(f"model_urn   : {r[4]}")
            print(f"source_urn  : {r[5]}")
            props = r[6]
            if props:
                print(f"properties ({len(props)} categorias):")
                print(json.dumps(props, indent=2, ensure_ascii=False))
            else:
                print("properties  : NULL")
        
    print(f"\nTotal resultados exactos: {len(rows)}")
