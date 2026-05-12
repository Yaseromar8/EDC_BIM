import psycopg2

conn = psycopg2.connect(host='34.86.206.187', dbname='postgres', user='postgres', password='omarsancheZ85*', port='5432', connect_timeout=10)
cur = conn.cursor()

st_urn = 'dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLnViMnhmakRpUkJ5YW1rTXp2Q0Q3emc_dmVyc2lvbj0yMw'

print('=== CATEGORIAS en modelo estructural (vista SCL_APS) ===')
cur.execute("""
    SELECT properties->>'__category__' as cat, COUNT(*) 
    FROM inventory_assets WHERE source_urn=%s 
    GROUP BY cat ORDER BY COUNT(*) DESC
""", (st_urn,))
for r in cur.fetchall():
    print(f'  {r[0] or "(null)"}: {r[1]}')

# Total global
print()
cur.execute("SELECT COUNT(*) FROM inventory_assets WHERE model_urn='1_CANAL'")
total = cur.fetchone()[0]
print(f'TOTAL en 1_CANAL: {total}')

# Source URNs
print()
print('=== Source URNs ===')
cur.execute("SELECT source_urn, COUNT(*) FROM inventory_assets WHERE model_urn='1_CANAL' GROUP BY source_urn ORDER BY COUNT(*) DESC")
for r in cur.fetchall():
    print(f'  ...{r[0][-30:]}: {r[1]}')

conn.close()
