import json

def find_streets():
    fn = 'D:/VISOR_APS_TL/backend/audit_politecnico_raw.json'
    try:
        with open(fn, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        print(">>> Buscando 'Calle 1' y 'Calle 3' en el JSON:")
        # Search in constraints
        for c in data.get('constraints', []):
            if 'Calle 1' in str(c) or 'Calle 3' in str(c) or '8.45' in str(c) or '7.79' in str(c):
                print(f"Match in constraint: {c}")
                
        # Search in other potential fields
        for k, v in data.items():
            if k == 'constraints': continue
            if 'Calle 1' in str(v) or 'Calle 3' in str(v) or '8.45' in str(v) or '7.79' in str(v):
                print(f"Match in field '{k}': {str(v)[:200]}...")
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    find_streets()
