import sys, os
sys.path.insert(0, '.')
from dotenv import load_dotenv
load_dotenv()
from db import get_db_connection

lines = []
with get_db_connection() as conn:
    cur = conn.cursor()
    cur.execute('SELECT COUNT(*) FROM inventory_assets')
    total = cur.fetchone()[0]
    lines.append(f'Total registros: {total}')
    
    cur.execute('''
        SELECT model_urn, COUNT(*), MIN(last_updated), MAX(last_updated)
        FROM inventory_assets GROUP BY model_urn ORDER BY MAX(last_updated) DESC
    ''')
    rows = cur.fetchall()
    lines.append(f'Modelos encontrados: {len(rows)}')
    for i, r in enumerate(rows, 1):
        urn_short = (r[0] or 'NULL')[:70]
        lines.append(f'')
        lines.append(f'Modelo {i}: {urn_short}')
        lines.append(f'  Activos: {r[1]}')
        lines.append(f'  Primera: {r[2]}')
        lines.append(f'  Ultima:  {r[3]}')
    
    cur.execute('SELECT external_id, COUNT(*) FROM inventory_assets GROUP BY external_id HAVING COUNT(*) > 1 LIMIT 5')
    dups = cur.fetchall()
    lines.append(f'')
    lines.append(f'Duplicados: {len(dups)}')
    
    cur.execute("SELECT COUNT(*) FROM inventory_assets WHERE properties IS NOT NULL AND properties != '{}'")
    wp = cur.fetchone()[0]
    lines.append(f'Con propiedades: {wp}/{total}')
    cur.close()

with open('db_audit.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
print('Archivo db_audit.txt creado')
