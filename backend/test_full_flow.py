import requests, json

# Step 1: See what's in the DB right now
print("=== ESTADO ACTUAL DB ===")
import psycopg2
conn = psycopg2.connect(host='34.86.206.187', dbname='postgres', user='postgres', password='omarsancheZ85*')
cur = conn.cursor()
cur.execute('SELECT model_id, name, urn, app_project_id FROM model_config ORDER BY added_at')
for r in cur.fetchall():
    print('  DB:', r)

# Step 2: Simulate adding a model to 1_CANAL
print("\n=== SIMULANDO ADD A 1_CANAL ===")
payload = {
    "urn": "TEST_URN_CANAL_CHECK",
    "name": "TestModel.rvt",
    "region": "US",
    "project": "1_CANAL"
}
r = requests.post('http://localhost:3000/api/config/project/add', json=payload)
print("Status:", r.status_code)
resp = r.json()
print("Models returned:", len(resp.get('models', [])))
for m in resp.get('models', []):
    print("  RESP:", m.get('name'), '| appProjectId:', m.get('appProjectId'))

# Step 3: Check DB after add
print("\n=== DB DESPUES DEL ADD ===")
cur.execute('SELECT model_id, name, urn, app_project_id FROM model_config ORDER BY added_at')
for r in cur.fetchall():
    print('  DB:', r)

# Step 4: Now simulate GET for 1_CANAL
print("\n=== GET 1_CANAL ===")
r = requests.get('http://localhost:3000/api/config/project', params={'project': '1_CANAL'})
d = r.json()
for m in d.get('models', []):
    print('  GET_CANAL:', m.get('name'), '| appProjectId:', m.get('appProjectId'))

# Step 5: Now simulate GET for 1_DRENAJE
print("\n=== GET 1_DRENAJE ===")
r = requests.get('http://localhost:3000/api/config/project', params={'project': '1_DRENAJE'})
d = r.json()
for m in d.get('models', []):
    print('  GET_DRENAJE:', m.get('name'), '| appProjectId:', m.get('appProjectId'))

# Step 6: Cleanup
cur.execute("DELETE FROM model_config WHERE urn = 'TEST_URN_CANAL_CHECK'")
conn.commit()
print("\nCleanup done.")
