import psycopg2, os, json

conn = psycopg2.connect(os.environ.get('DATABASE_URL', 'postgresql://admin:visiion2025@localhost:5432/visor_aps'))
cur = conn.cursor()

print("Buscando fotos corruptas ('Subiendo...') en la base de datos...")

cur.execute("SELECT id, data FROM tracking_pins WHERE pin_type='fotos'")
updated_count = 0

for row in cur.fetchall():
    pin_id = row[0]
    data = row[1] if isinstance(row[1], dict) else json.loads(row[1]) if row[1] else {}
    
    if 'photos' in data and data['photos']:
        original_count = len(data['photos'])
        # Filtrar las que tienen fullPath = 'Subiendo...'
        clean_photos = [p for p in data['photos'] if p.get('fullPath') != 'Subiendo...']
        
        if len(clean_photos) < original_count:
            data['photos'] = clean_photos
            cur.execute("UPDATE tracking_pins SET data = %s WHERE id = %s", (json.dumps(data), pin_id))
            print(f"✅ PIN {pin_id}: Eliminadas {original_count - len(clean_photos)} fotos corruptas.")
            updated_count += 1

if updated_count > 0:
    conn.commit()
    print(f"¡Limpieza completada! {updated_count} pines actualizados.")
else:
    print("La base de datos está limpia. No se encontraron fotos corruptas.")

conn.close()
