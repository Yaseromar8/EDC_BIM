"""
Limpieza INTEGRAL de nodos tipo/familia ya existentes en PostgreSQL.
Usa la metadata __node__.__node_type__ almacenada en JSONB para
identificar nodos que NO son 'instance' y eliminarlos.
Además, detecta nodos fantasma que burlaron el clasificador original
usando heurísticas genéricas sobre la jerarquía de nombres de Revit.
"""
import psycopg2
import json

DB = dict(host='34.86.206.187', dbname='postgres', user='postgres', password='omarsancheZ85*', port='5432')

def clean_integral():
    conn = psycopg2.connect(**DB)
    cur = conn.cursor()
    
    # ═══════════════════════════════════════════════════════════
    # PASO 1: Eliminar todo lo que ya está marcado como 'type' o 'category'
    # ═══════════════════════════════════════════════════════════
    cur.execute("""
        DELETE FROM inventory_assets 
        WHERE properties->'__node__'->>'__node_type__' IN ('type', 'category')
    """)
    step1 = cur.rowcount
    print(f"[Paso 1] Eliminados {step1} nodos type/category por __node_type__")
    
    # ═══════════════════════════════════════════════════════════
    # PASO 2: Detección INTEGRAL de nodos tipo/familia que burlaron
    # el clasificador (tenían [ID] en el nombre pero no son instancias).
    # 
    # Criterio: Si un elemento con nombre "X [ID]" tiene OTRO elemento  
    # con el MISMO external_id base (misma familia), Y su nombre es
    # genérico de tipo de Revit → es un nodo fantasma.
    #
    # Revit Type Definitions siempre siguen el patrón:
    # - NO tienen propiedades geométricas propias (Area=0, Volume=0, Length=0)
    # - O sus propiedades son idénticas a las de otro elemento real
    # ═══════════════════════════════════════════════════════════
    cur.execute("SELECT external_id, name, properties FROM inventory_assets")
    rows = cur.fetchall()
    
    phantom_ids = []
    # Agrupar por source_urn + partida para detectar duplicados
    partida_groups = {}  # (source_urn, partida_code) -> [(external_id, name, metrado)]
    
    for ext_id, name, props in rows:
        if not props or not isinstance(props, dict):
            continue
        
        # Buscar si tiene algún código de partida
        for slot in ['03_05_DSI_CodigoDePartida1', '03_05_DSI_CodigoDePartida2', '03_05_DSI_CodigoDePartida3']:
            code = None
            # Buscar en todas las categorías de propiedades
            for cat_name, cat_vals in props.items():
                if isinstance(cat_vals, dict) and slot in cat_vals:
                    code = str(cat_vals[slot]).strip()
                    break
            if not code:
                continue
            
            # Buscar metrado asociado
            metrado_key = slot.replace('CodigoDePartida', 'Metrado').replace('03_05', '03_06')
            metrado = 0
            for cat_name, cat_vals in props.items():
                if isinstance(cat_vals, dict) and metrado_key in cat_vals:
                    try:
                        metrado = float(str(cat_vals[metrado_key]).split()[0])
                    except:
                        pass
                    break
            
            key = code
            if key not in partida_groups:
                partida_groups[key] = []
            partida_groups[key].append((ext_id, name, metrado))
    
    # Detectar duplicados: si dos elementos tienen la misma partida y EXACTO mismo metrado,
    # y uno tiene nombre de tipo ("Tipos de X"), el de nombre tipo es fantasma
    for partida, elements in partida_groups.items():
        if len(elements) < 2:
            continue
        
        # Agrupar por metrado exacto
        by_metrado = {}
        for ext_id, name, metrado in elements:
            m_key = round(metrado, 4)
            if m_key not in by_metrado:
                by_metrado[m_key] = []
            by_metrado[m_key].append((ext_id, name))
        
        for m_key, dupes in by_metrado.items():
            if len(dupes) < 2:
                continue
            # Si hay duplicados con mismo metrado, el que tiene nombre genérico es fantasma
            for ext_id, name in dupes:
                name_lower = name.lower() if name else ''
                # Patrones genéricos de nodos tipo en Revit (ES + EN)
                if (name_lower.startswith('tipos de ') or 
                    name_lower.startswith('type ') or
                    ' types [' in name_lower or
                    ' tipos [' in name_lower or
                    name_lower.startswith('system type') or
                    name_lower.startswith('tipo de sistema')):
                    phantom_ids.append(ext_id)
                    print(f"  [FANTASMA] '{name}' (partida={partida}, metrado={m_key})")
    
    if phantom_ids:
        # Eliminar fantasmas detectados
        format_str = ','.join(['%s'] * len(phantom_ids))
        cur.execute(f"DELETE FROM inventory_assets WHERE external_id IN ({format_str})", phantom_ids)
        step2 = cur.rowcount
        print(f"[Paso 2] Eliminados {step2} nodos fantasma por análisis de duplicados")
    else:
        step2 = 0
        print(f"[Paso 2] Sin fantasmas adicionales detectados")
    
    conn.commit()
    
    # Reporte final
    cur.execute("SELECT COUNT(*) FROM inventory_assets")
    remaining = cur.fetchone()[0]
    
    cur.close()
    conn.close()
    
    print(f"\n{'='*60}")
    print(f"[LIMPIEZA INTEGRAL COMPLETADA]")
    print(f"  Paso 1 (node_type):     {step1} eliminados")
    print(f"  Paso 2 (duplicados):    {step2} eliminados")
    print(f"  Total eliminados:       {step1 + step2}")
    print(f"  Registros restantes:    {remaining}")
    print(f"{'='*60}")

if __name__ == '__main__':
    clean_integral()
