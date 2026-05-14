"""
DIAGNOSTICO DE VISTAS GUARDADAS - VISIION
Verifica: tabla, datos, API save/load/delete
"""
import requests
import psycopg2
import json
import time

BACKEND = "http://localhost:3000"
DB_HOST = "34.86.206.187"

print("=" * 60)
print("  DIAGNOSTICO: SAVED VIEWS")
print("=" * 60)

conn = psycopg2.connect(host=DB_HOST, dbname='postgres', user='postgres', password='omarsancheZ85*')
cur = conn.cursor()

# 1. Tabla existe?
print("\n[1/6] Verificar tabla saved_views...")
cur.execute("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'saved_views')")
exists = cur.fetchone()[0]
print(f"  Tabla existe: {exists}")

if exists:
    cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'saved_views' ORDER BY ordinal_position")
    for r in cur.fetchall():
        print(f"    {r[0]}: {r[1]}")

# 2. Datos actuales
print("\n[2/6] Vistas guardadas en BD...")
cur.execute("SELECT id, name, project_id, created_at FROM saved_views ORDER BY created_at")
rows = cur.fetchall()
print(f"  Total: {len(rows)}")
for r in rows:
    print(f"    id={r[0]}, name={r[1]}, project={r[2]}, created={r[3]}")

# 3. GET API
print("\n[3/6] GET /api/views (sin filtro)...")
r = requests.get(f"{BACKEND}/api/views")
print(f"  Status: {r.status_code}, Count: {len(r.json())}")

print("\n[3b/6] GET /api/views?project=1_CANAL...")
r = requests.get(f"{BACKEND}/api/views", params={"project": "1_CANAL"})
print(f"  Status: {r.status_code}, Count: {len(r.json())}")

# 4. POST - Guardar vista de prueba
print("\n[4/6] POST /api/views (guardar vista de prueba)...")
test_view = {
    "name": "DIAG_TestView",
    "viewerState": {"camera": {"position": [1,2,3], "target": [0,0,0]}},
    "filterState": {"filterSelections": {"prop1": ["val1"]}, "filterColors": {}},
    "project": "1_CANAL"
}
r = requests.post(f"{BACKEND}/api/views", json=test_view)
print(f"  Status: {r.status_code}")
if r.status_code == 200:
    saved = r.json()
    view_id = saved.get("id")
    print(f"  Saved ID: {view_id}")
    print(f"  Has viewerState: {'viewerState' in saved}")
    print(f"  Has filterState: {'filterState' in saved}")
    print(f"  ProjectId: {saved.get('projectId')}")

    # 5. GET individual
    print(f"\n[5/6] GET /api/views/{view_id}...")
    r2 = requests.get(f"{BACKEND}/api/views/{view_id}")
    print(f"  Status: {r2.status_code}")
    if r2.status_code == 200:
        loaded = r2.json()
        camera_match = loaded.get("viewerState", {}).get("camera", {}).get("position") == [1,2,3]
        filter_match = loaded.get("filterState", {}).get("filterSelections", {}).get("prop1") == ["val1"]
        print(f"  Camera restored correctly: {camera_match}")
        print(f"  Filters restored correctly: {filter_match}")
        if not camera_match:
            print(f"    GOT: {loaded.get('viewerState')}")
        if not filter_match:
            print(f"    GOT: {loaded.get('filterState')}")

    # 6. DELETE
    print(f"\n[6/6] DELETE /api/views/{view_id}...")
    r3 = requests.delete(f"{BACKEND}/api/views/{view_id}")
    print(f"  Status: {r3.status_code}")
    
    # Verify deleted
    cur.execute("SELECT id FROM saved_views WHERE id = %s", (view_id,))
    still_exists = cur.fetchone()
    print(f"  Actually deleted from DB: {still_exists is None}")
else:
    print(f"  ERROR: {r.text}")
    print("\n[5/6] SKIPPED")
    print("[6/6] SKIPPED")

print("\n" + "=" * 60)
print("  DIAGNOSTICO COMPLETO")
print("=" * 60)
