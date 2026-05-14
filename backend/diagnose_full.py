"""
DIAGNÓSTICO INTEGRAL - VISIION Race Condition Fix
Verifica que el backend y la BD están consistentes antes del deploy.
"""
import requests
import psycopg2
import json
import time

BACKEND = "http://localhost:3000"
DB_HOST = "34.86.206.187"

print("=" * 60)
print("  DIAGNÓSTICO INTEGRAL - PRE-DEPLOY")
print("=" * 60)

# ── 1. Conexión a BD ──
print("\n[1/7] Conexión a PostgreSQL...")
try:
    conn = psycopg2.connect(host=DB_HOST, dbname='postgres', user='postgres', password='omarsancheZ85*')
    cur = conn.cursor()
    print("  ✅ Conexión exitosa")
except Exception as e:
    print(f"  ❌ FALLO: {e}")
    exit(1)

# ── 2. Estado actual de model_config ──
print("\n[2/7] Estado actual de model_config...")
cur.execute("SELECT model_id, name, app_project_id, urn FROM model_config ORDER BY added_at")
rows = cur.fetchall()
print(f"  Total registros: {len(rows)}")
for r in rows:
    print(f"    model_id={r[0]}, name={r[1]}, project={r[2]}, urn=...{r[3][-20:]}")

# ── 3. Verificar aislamiento GET ──
print("\n[3/7] Verificar aislamiento GET por frente...")
for frente in ["1_CANAL", "1_DRENAJE", "1_INFRAWORKS"]:
    r = requests.get(f"{BACKEND}/api/config/project", params={"project": frente})
    models = r.json().get("models", [])
    print(f"  GET project={frente}: {len(models)} modelos")
    for m in models:
        pid = m.get("appProjectId", "?")
        if pid != frente:
            print(f"    ⚠️ CONTAMINACIÓN: modelo con appProjectId={pid} apareció en frente {frente}")
        else:
            print(f"    ✅ {m['name']} → appProjectId={pid}")

# ── 4. Test de ADD + aislamiento ──
print("\n[4/7] Test ADD a 1_CANAL + verificar que NO aparece en 1_DRENAJE...")
test_urn = f"TEST_DIAG_{int(time.time())}"
payload = {"urn": test_urn, "name": "DIAG_TestModel.rvt", "region": "US", "project": "1_CANAL"}
r = requests.post(f"{BACKEND}/api/config/project/add", json=payload)
if r.status_code == 200:
    resp_models = r.json().get("models", [])
    found_in_resp = any(m["urn"] == test_urn for m in resp_models)
    print(f"  ADD status=200, modelo en respuesta: {found_in_resp}")
    
    # Verificar que NO aparece en Drenaje
    r2 = requests.get(f"{BACKEND}/api/config/project", params={"project": "1_DRENAJE"})
    drenaje_models = r2.json().get("models", [])
    leaked = any(m["urn"] == test_urn for m in drenaje_models)
    if leaked:
        print("  ❌ CONTAMINACIÓN CRUZADA: el modelo de Canal apareció en Drenaje!")
    else:
        print("  ✅ Aislamiento verificado: modelo NO aparece en Drenaje")
else:
    print(f"  ❌ ADD falló: status={r.status_code}")

# ── 5. Test de REMOVE con aislamiento ──
print("\n[5/7] Test REMOVE desde 1_CANAL...")
# Primero inyectar un duplicado en Drenaje directamente en BD
cur.execute("INSERT INTO model_config (model_id, urn, app_project_id, name) VALUES (%s, %s, %s, %s)",
            (f"diag_drenaje_{int(time.time())}", test_urn, "1_DRENAJE", "DIAG_Drenaje_Copy"))
conn.commit()

cur.execute("SELECT app_project_id FROM model_config WHERE urn = %s ORDER BY app_project_id", (test_urn,))
before = [r[0] for r in cur.fetchall()]
print(f"  ANTES del remove: URN presente en frentes = {before}")

r3 = requests.post(f"{BACKEND}/api/config/project/remove", json={"urn": test_urn, "project": "1_CANAL"})
print(f"  REMOVE status={r3.status_code}")

cur.execute("SELECT app_project_id FROM model_config WHERE urn = %s ORDER BY app_project_id", (test_urn,))
after = [r[0] for r in cur.fetchall()]
print(f"  DESPUÉS del remove: URN presente en frentes = {after}")

if "1_CANAL" not in after and "1_DRENAJE" in after:
    print("  ✅ Aislamiento de REMOVE verificado: solo se borró de Canal, Drenaje intacto")
elif "1_CANAL" in after:
    print("  ❌ FALLO: El modelo de Canal NO fue borrado")
elif "1_DRENAJE" not in after:
    print("  ❌ CONTAMINACIÓN: El modelo de Drenaje también fue borrado!")

# ── 6. Cleanup ──
print("\n[6/7] Limpieza de datos de diagnóstico...")
cur.execute("DELETE FROM model_config WHERE urn = %s", (test_urn,))
conn.commit()
deleted = cur.rowcount
print(f"  Eliminados {deleted} registros de prueba")

# ── 7. Constraints ──
print("\n[7/7] Constraints de model_config...")
cur.execute("""SELECT constraint_name, constraint_type 
               FROM information_schema.table_constraints 
               WHERE table_name = 'model_config'""")
for r in cur.fetchall():
    print(f"  {r[1]}: {r[0]}")

print("\n" + "=" * 60)
print("  DIAGNÓSTICO COMPLETO")
print("=" * 60)
