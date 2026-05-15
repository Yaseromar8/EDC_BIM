"""
Script para re-extraer el inventario de un modelo sin necesidad de subir nueva versión.
Llama al endpoint /api/inventory/extract del backend local y monitorea el progreso.

Uso: python reextract_inventory.py
"""
import requests
import time
import sys

# Configuración del backend
BACKEND = "http://localhost:8000"

# 1. Obtener los modelos disponibles consultando inventory_assets
print("[Re-Extract] Consultando modelos en el inventario actual...")

# Intentar obtener la lista de URNs desde el backend
try:
    resp = requests.get(f"{BACKEND}/api/inventory")
    if resp.status_code != 200:
        print(f"[ERROR] No se pudo consultar /api/inventory: {resp.status_code}")
        sys.exit(1)
    
    data = resp.json()
    # Extraer URNs únicos de model_urn y source_urn
    urn_pairs = set()
    for item in data:
        model_urn = item.get('model_urn', '')
        source_urn = item.get('source_urn', '') or model_urn
        if source_urn:
            urn_pairs.add((model_urn, source_urn))
    
    if not urn_pairs:
        print("[ERROR] No se encontraron modelos en el inventario.")
        sys.exit(1)
    
    print(f"\n[Re-Extract] Encontrados {len(urn_pairs)} modelo(s) únicos:")
    for i, (m_urn, s_urn) in enumerate(urn_pairs, 1):
        label = s_urn[:70] + "..." if len(s_urn) > 70 else s_urn
        print(f"  {i}. {label}")
    
    # Seleccionar modelo(s)
    print(f"\n¿Qué modelo(s) re-extraer?")
    print(f"  [a] Todos ({len(urn_pairs)} modelos)")
    print(f"  [1-{len(urn_pairs)}] Modelo específico")
    print(f"  [q] Cancelar")
    
    choice = input("\n> ").strip().lower()
    
    if choice == 'q':
        print("Cancelado.")
        sys.exit(0)
    
    selected = []
    if choice == 'a':
        selected = list(urn_pairs)
    else:
        try:
            idx = int(choice) - 1
            selected = [list(urn_pairs)[idx]]
        except (ValueError, IndexError):
            print("[ERROR] Selección inválida.")
            sys.exit(1)
    
    # 2. Lanzar extracción para cada modelo seleccionado
    for model_urn, source_urn in selected:
        print(f"\n{'='*60}")
        print(f"[Re-Extract] Lanzando extracción para:")
        print(f"  source_urn: {source_urn[:80]}...")
        print(f"  target_urn: {model_urn[:80]}...")
        
        resp = requests.post(f"{BACKEND}/api/inventory/extract", json={
            'urn': source_urn,
            'target_urn': model_urn
        })
        
        if resp.status_code != 202:
            print(f"[ERROR] Falló el lanzamiento: {resp.status_code} {resp.text}")
            continue
        
        job_id = resp.json().get('job_id')
        print(f"[Re-Extract] Job iniciado: {job_id}")
        
        # 3. Monitorear progreso
        while True:
            time.sleep(3)
            status_resp = requests.get(f"{BACKEND}/api/inventory/extract/status/{job_id}")
            if status_resp.status_code != 200:
                print(f"[ERROR] No se pudo consultar status: {status_resp.status_code}")
                break
            
            status = status_resp.json()
            pct = status.get('progress', 0)
            msg = status.get('message', '')
            state = status.get('status', '')
            
            bar = '█' * (pct // 5) + '░' * (20 - pct // 5)
            print(f"\r  [{bar}] {pct}% - {msg}", end='', flush=True)
            
            if state in ('success', 'error'):
                print()  # New line
                if state == 'success':
                    print(f"  ✅ {msg}")
                else:
                    print(f"  ❌ ERROR: {msg}")
                break
    
    print(f"\n{'='*60}")
    print("[Re-Extract] ¡Completado! Refresca la web para ver los cambios.")

except requests.exceptions.ConnectionError:
    print(f"[ERROR] No se pudo conectar al backend en {BACKEND}")
    print("Asegúrate de que el servidor esté corriendo (python server.py)")
    sys.exit(1)
