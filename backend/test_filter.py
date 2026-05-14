import requests, json

# Simular lo que hace el frontend al abrir Canal
r1 = requests.get('http://localhost:3000/api/config/project', params={'project': '1_CANAL'})
print('=== GET con project=1_CANAL ===')
print('Status:', r1.status_code)
d1 = r1.json()
print('Models count:', len(d1.get('models', [])))
for m in d1.get('models', []):
    print('  -> name=' + m['name'] + ', appProjectId=' + str(m.get('appProjectId')) + ', urn=...' + m['urn'][-20:])

print()

# Simular lo que hace el frontend al abrir Drenaje
r2 = requests.get('http://localhost:3000/api/config/project', params={'project': '1_DRENAJE'})
print('=== GET con project=1_DRENAJE ===')
print('Status:', r2.status_code)
d2 = r2.json()
print('Models count:', len(d2.get('models', [])))
for m in d2.get('models', []):
    print('  -> name=' + m['name'] + ', appProjectId=' + str(m.get('appProjectId')) + ', urn=...' + m['urn'][-20:])
