"""
Re-extrae los metadatos del archivo de tuberías de Drenaje
llamando al backend desplegado en Render.
"""
import requests
import time
import json

BACKEND = "https://visor-ecd-backend.onrender.com"

# El archivo de tuberías: vf.BxFLrf-oSQyakggpwbgK4g (version actual en BD: v47)
# URN v47 base64 URL-safe
urn = "dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLkJ4RkxyZi1vU1F5YWtnZ3B3YmdLNGc_dmVyc2lvbj00Nw"
model_urn = "1_DRENAJE"

print(f"[Reextract] Disparando extracción para {urn[:50]}...")
print(f"[Reextract] Backend: {BACKEND}")

try:
    resp = requests.post(
        f"{BACKEND}/api/inventory/extract",
        json={"urn": urn, "model_urn": model_urn},
        timeout=30
    )
    print(f"[Reextract] Status: {resp.status_code}")
    data = resp.json()
    print(f"[Reextract] Response: {json.dumps(data, indent=2)}")
    
    job_id = data.get('job_id')
    if job_id:
        print(f"\n[Reextract] Job iniciado: {job_id}")
        print("[Reextract] Monitoreando progreso...")
        
        for i in range(60):  # Max 5 minutos
            time.sleep(5)
            st = requests.get(f"{BACKEND}/api/inventory/extract/status/{job_id}", timeout=15)
            st_data = st.json()
            status = st_data.get('status', 'unknown')
            progress = st_data.get('progress', 0)
            msg = st_data.get('message', '')
            print(f"  [{i*5}s] {status} ({progress}%) - {msg}")
            
            if status in ('success', 'error'):
                break
        
        print(f"\n[Reextract] TERMINADO: {status}")
    else:
        print("[Reextract] No se recibió job_id")

except Exception as e:
    print(f"[Reextract] ERROR: {e}")
