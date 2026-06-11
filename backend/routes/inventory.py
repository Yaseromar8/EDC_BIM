import os
import json
import threading
import time
import requests
import psycopg2
from datetime import datetime
from flask import Blueprint, request, jsonify

inventory_bp = Blueprint('inventory', __name__)

# Memoria temporal para progreso (en un entorno PROD debería ser Redis/DB)
EXTRACTION_JOBS = {}

APS_MD_URL = "https://developer.api.autodesk.com/modelderivative/v2/designdata"

# =====================================================================
# NORMALIZACIÓN DE CATEGORÍAS REVIT (ES → EN)
# Revit exporta categorías en el idioma del template del proyecto.
# Este mapa unifica nombres en español a sus equivalentes en inglés.
# =====================================================================
REVIT_CATEGORY_ES_TO_EN = {
    'Muros': 'Walls',
    'Suelos': 'Floors',
    'Modelos genéricos': 'Generic Models',
    'Armadura estructural': 'Structural Rebar',
    'Bordes de losa': 'Slab Edges',
    'Aparatos sanitarios': 'Plumbing Fixtures',
    'Puertas': 'Doors',
    'Ventanas': 'Windows',
    'Pilares estructurales': 'Structural Columns',
    'Pilares': 'Columns',
    'Vigas': 'Beams',
    'Techos': 'Ceilings',
    'Cubiertas': 'Roofs',
    'Escaleras': 'Stairs',
    'Tramos': 'Stair Runs',
    'Descansillos': 'Stair Landings',
    'Barandillas': 'Railings',
    'Líneas': 'Lines',
    'Tuberías': 'Pipes',
    'Conductos': 'Ducts',
    'Bandejas de cables': 'Cable Trays',
    'Mobiliario': 'Furniture',
    'Equipos mecánicos': 'Mechanical Equipment',
    'Equipos eléctricos': 'Electrical Equipment',
    'Iluminación': 'Lighting Fixtures',
    'Rampas': 'Ramps',
    'Áreas': 'Areas',
    'Habitaciones': 'Rooms',
    'Niveles': 'Levels',
    'Rejillas': 'Grids',
    'Cimentación estructural': 'Structural Foundations',
    'Conexiones estructurales': 'Structural Connections',
    'Armazón estructural': 'Structural Framing',
    'Estructura': 'Structural Framing',
    'Refuerzo de área estructural': 'Structural Area Reinforcement',
    'Refuerzo de trayectoria estructural': 'Structural Path Reinforcement',
    'Cerramientos': 'Curtain Walls',
    'Montantes de cerramiento': 'Curtain Wall Mullions',
    'Paneles de cerramiento': 'Curtain Panels',
    'Sistemas de tuberías': 'Piping Systems',
    'Accesorios de tuberías': 'Pipe Fittings',
    'Accesorios de tubería': 'Pipe Fittings',
    'Topografía': 'Topography',
    'Vegetación': 'Planting',
    'Forjados': 'Floors',
}

import re as _re

def _is_filename(name):
    """Detecta si un nombre de nodo es un archivo vinculado, no una categoría."""
    if _re.search(r'\.(dwg|rvt|ifc|nwc|nwd)$', name, _re.IGNORECASE):
        return True
    if _re.match(r'^[A-Z0-9_\-]+$', name) and len(name) > 3:
        return True
    return False

def normalize_revit_category(raw_cat):
    """Normaliza una categoría de Revit: traduce ES→EN y detecta linked models."""
    if not raw_cat or raw_cat == '(Unassigned)':
        return raw_cat or '(Unassigned)'
    trimmed = str(raw_cat).strip()
    if _is_filename(trimmed):
        return '(Linked Model)'
    return REVIT_CATEGORY_ES_TO_EN.get(trimmed, trimmed)


def get_internal_token():
    from aps import get_internal_token as aps_token
    return aps_token()

def sanitize_urn(urn):
    """
    Convierte un URN base64 estandar a base64 URL-safe.
    Autodesk Model Derivative API requiere URL-safe base64:
      - '+' -> '-'
      - '/' -> '_'
      - Eliminar '=' de padding
    Si el URN es texto plano (urn:adsk...), primero lo codifica.
    """
    if urn.startswith('urn:adsk'):
        import base64
        urn = base64.b64encode(urn.encode()).decode()
    # Convertir a URL-safe base64
    urn = urn.replace('+', '-').replace('/', '_').rstrip('=')
    return urn

def extract_metadata_task(urn, target_urn, job_id):
    """ Tarea en segundo plano para extraer metadata de Autodesk. """
    try:
        print(f"\n[Extractor] ===== INICIO JOB: {job_id} =====")
        print(f"[Extractor] URN recibido (raw): {urn}")
        
        # Sanitizar URN a URL-safe base64
        urn = sanitize_urn(urn)
        print(f"[Extractor] URN sanitizado: {urn}")
        print(f"[Extractor] Target URN: {target_urn}")
        
        EXTRACTION_JOBS[job_id] = {'status': 'pending', 'progress': 0, 'message': 'Conectando con Autodesk...'}
        token_result = get_internal_token()
        if isinstance(token_result, tuple):
            token, err = token_result
        else:
            token, err = token_result, None
            
        if err or not token:
            raise Exception(f"Token error: {err}")
        print(f"[Extractor] Token obtenido OK")
        EXTRACTION_JOBS[job_id] = {'status': 'pending', 'progress': 10, 'message': 'Autenticacion exitosa. Consultando modelo...'}

        # Fase 1: GUID
        EXTRACTION_JOBS[job_id] = {'status': 'pending', 'progress': 20, 'message': 'Buscando metadatos 3D del modelo...'}
        uid_url = f"{APS_MD_URL}/{urn}/metadata"
        headers = {'Authorization': f'Bearer {token}'}
        
        print(f"[Extractor] Fase 1 - GET {uid_url}")
        resp = requests.get(uid_url, headers=headers)
        print(f"[Extractor] Fase 1 - Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"[Extractor] Fase 1 - Body: {resp.text[:500]}")
            resp.raise_for_status()
            
        metadata = resp.json().get('data', {}).get('metadata', [])
        print(f"[Extractor] Fase 1 - Encontradas {len(metadata)} vistas")
        
        if not metadata:
            raise Exception("No se encontraron metadatos para este URN.")
        
        # --- Selección inteligente de GUID ---
        # Prioridad 1: default_view_guid de model_config (configurado por el usuario)
        # Prioridad 2: Vista 3D con más elementos (leaf nodes)
        # Prioridad 3: Primera vista de cualquier tipo
        configured_guid = None
        try:
            from db import get_db_connection
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT default_view_guid FROM model_config WHERE urn = %s AND default_view_guid IS NOT NULL",
                    (urn,)
                )
                row = cursor.fetchone()
                if row and row[0]:
                    configured_guid = row[0]
                    print(f"[Extractor] default_view_guid encontrado en model_config: {configured_guid}")
        except Exception as db_err:
            print(f"[Extractor] Advertencia: No se pudo consultar model_config: {db_err}")

        guid = None
        available_guids = set()
        views_3d = []
        for view in metadata:
            print(f"[Extractor]   Vista: {view.get('name')} (role={view.get('role')}, guid={view.get('guid')})")
            available_guids.add(view.get('guid'))
            if view.get('role') == '3d':
                views_3d.append(view)

        # Intentar usar el GUID configurado si existe y está disponible en el manifest
        if configured_guid and configured_guid in available_guids:
            guid = configured_guid
            matched_name = next((v.get('name') for v in metadata if v.get('guid') == guid), '?')
            print(f"[Extractor] Usando default_view_guid configurado: {guid} (vista: {matched_name})")
        else:
            if configured_guid:
                print(f"[Extractor] ADVERTENCIA: default_view_guid '{configured_guid}' no encontrado en manifest, usando fallback")
            # Fallback INTELIGENTE: elegir la vista 3D con más nodos hoja
            if len(views_3d) == 1:
                guid = views_3d[0]['guid']
                print(f"[Extractor] Fallback: única vista 3D: {guid} (vista: {views_3d[0].get('name')})")
            elif len(views_3d) > 1:
                print(f"[Extractor] Fallback: evaluando {len(views_3d)} vistas 3D para elegir la más completa...")
                best_guid = None
                best_count = -1
                best_name = '?'
                for v3d in views_3d:
                    v_guid = v3d['guid']
                    try:
                        v_resp = requests.get(f"{APS_MD_URL}/{urn}/metadata/{v_guid}", headers=headers, timeout=30)
                        v_resp.raise_for_status()
                        v_objects = v_resp.json().get('data', {}).get('objects', [])
                        # Contar hojas
                        leaf_count = 0
                        def _count_leaves(objs):
                            nonlocal leaf_count
                            for o in objs:
                                ch = o.get('objects', [])
                                if not ch:
                                    leaf_count += 1
                                else:
                                    _count_leaves(ch)
                        _count_leaves(v_objects)
                        print(f"[Extractor]   Vista '{v3d.get('name')}' (guid={v_guid}): {leaf_count} hojas")
                        if leaf_count > best_count:
                            best_count = leaf_count
                            best_guid = v_guid
                            best_name = v3d.get('name', '?')
                    except Exception as ve:
                        print(f"[Extractor]   Vista '{v3d.get('name')}' error: {ve}")
                if best_guid:
                    guid = best_guid
                    print(f"[Extractor] Fallback: mejor vista 3D seleccionada: {best_name} ({best_count} hojas, guid={guid})")
        if not guid:
            guid = metadata[0]['guid']
            print(f"[Extractor] Fallback final: primera vista disponible: {guid}")
        print(f"[Extractor] GUID seleccionado final: {guid}")

        # Fase 2: Extracción Properties (Paginada)
        # Usamos POST .../properties:query con paginación para garantizar cobertura total.
        # Fallback al GET legacy si el POST falla.
        EXTRACTION_JOBS[job_id] = {'status': 'pending', 'progress': 40, 'message': 'Descargando propiedades (paginado)...'}
        
        collection = None
        PAGE_SIZE = 500
        query_url = f"{APS_MD_URL}/{urn}/metadata/{guid}/properties:query"
        print(f"[Extractor] Fase 2 - POST paginado {query_url}")
        
        try:
            all_items = []
            offset = 0
            max_pages = 200  # Safety limit (100,000 elementos max)
            for page in range(max_pages):
                payload = {
                    'query': {},
                    'pagination': {'limit': PAGE_SIZE, 'offset': offset}
                }
                for attempt in range(20):
                    resp = requests.post(query_url, headers={**headers, 'Content-Type': 'application/json'}, json=payload)
                    if resp.status_code == 202:
                        pct = 40 + int((page * PAGE_SIZE) / max(1, PAGE_SIZE * 10) * 20)
                        EXTRACTION_JOBS[job_id] = {'status': 'pending', 'progress': min(pct, 65), 'message': f'Esperando respuesta de Autodesk (intento {attempt+1})...'}
                        time.sleep(5)
                        continue
                    break
                
                if resp.status_code == 202:
                    raise Exception("Timeout en paginación")
                resp.raise_for_status()
                batch = resp.json().get('data', {}).get('collection', [])
                all_items.extend(batch)
                print(f"[Extractor] Fase 2 - Página {page+1}: +{len(batch)} elementos (total: {len(all_items)})")
                EXTRACTION_JOBS[job_id] = {'status': 'pending', 'progress': min(40 + page * 3, 65), 'message': f'Descargando propiedades ({len(all_items)} elementos)...'}
                
                if len(batch) < PAGE_SIZE:
                    break  # Última página
                offset += PAGE_SIZE
            
            collection = all_items
            print(f"[Extractor] Fase 2 - POST paginado completado: {len(collection)} elementos totales")
            
        except Exception as paginated_err:
            # FALLBACK: GET legacy (funciona para modelos pequeños/medianos)
            print(f"[Extractor] Fase 2 - POST paginado falló ({paginated_err}), usando GET legacy...")
            prop_url = f"{APS_MD_URL}/{urn}/metadata/{guid}/properties?forceget=true"
            collection = None
            max_retries = 30
            for attempt in range(max_retries):
                resp = requests.get(prop_url, headers=headers)
                print(f"[Extractor] Fase 2 (GET fallback) - Intento {attempt+1}/{max_retries}: status={resp.status_code}")
                if resp.status_code == 202:
                    pct = 40 + int((attempt / max_retries) * 25)
                    EXTRACTION_JOBS[job_id] = {'status': 'pending', 'progress': pct, 'message': f'Esperando respuesta de Autodesk (intento {attempt+1})...'}
                    time.sleep(5)
                    continue
                resp.raise_for_status()
                collection = resp.json().get('data', {}).get('collection', [])
                print(f"[Extractor] Fase 2 (GET fallback) - Recibidos {len(collection)} elementos")
                break
                
        if collection is None:
            raise Exception("Autodesk tardó demasiado en preparar las propiedades.")

        # Fase 2.1: Extracción Árbol Jerárquico (Para Herencia Tipo->Instancia)
        EXTRACTION_JOBS[job_id] = {'status': 'pending', 'progress': 70, 'message': 'Descargando árbol jerárquico (Fusión Semántica)...'}
        hier_url = f"{APS_MD_URL}/{urn}/metadata/{guid}"
        print(f"[Extractor] Fase 2.1 - GET {hier_url}")
        hier_resp = requests.get(hier_url, headers=headers)
        hier_resp.raise_for_status()
        hier_objects = hier_resp.json().get('data', {}).get('objects', [])
        
        parent_map = {}
        def build_parent_map(objects_list, parent_id):
            for obj in objects_list:
                obj_id = obj.get('objectid')
                if parent_id is not None:
                    parent_map[obj_id] = parent_id
                children = obj.get('objects', [])
                if children:
                    build_parent_map(children, obj_id)
        build_parent_map(hier_objects, None)
        print(f"[Extractor] Fase 2.1 - Jerarquía extraída: {len(parent_map)} relaciones padre-hijo")

        # Fase 2.2: Verificación Cruzada (Tree Leaves vs Properties Collection)
        # Detectar nodos hoja del árbol que NO están en el collection de propiedades.
        # Esto captura Revit Parts y elementos que la API de propiedades puede omitir.
        tree_all_nodes = {}  # objectid -> name
        tree_leaf_ids = set()
        def catalog_tree(objects_list):
            for obj in objects_list:
                oid = obj.get('objectid')
                tree_all_nodes[oid] = obj.get('name', 'Unnamed')
                children = obj.get('objects', [])
                if not children:
                    tree_leaf_ids.add(oid)
                else:
                    catalog_tree(children)
        catalog_tree(hier_objects)
        
        # ═══════════════════════════════════════════════════════════
        # FILTRO INTEGRAL: Set de nodos PADRES en el árbol SVF.
        # Cualquier nodo que sea padre de otros nodos NO es una
        # instancia física, sino un nodo de tipo/familia/categoría.
        # Esto funciona para TODAS las categorías de Revit sin
        # necesidad de listas negras específicas por nombre.
        # ═══════════════════════════════════════════════════════════
        tree_parent_ids = set(parent_map.values())
        print(f"[Extractor] Fase 2.2 - Detectados {len(tree_parent_ids)} nodos padre (serán excluidos como no-instancias)")
        
        collection_ids = {node.get('objectid') for node in collection}
        missing_leaf_ids = tree_leaf_ids - collection_ids
        
        if missing_leaf_ids:
            print(f"[Extractor] Fase 2.2 - [!] DETECTADOS {len(missing_leaf_ids)} nodos hoja en arbol AUSENTES del collection")
            print(f"[Extractor] Fase 2.2 - Intentando recuperar propiedades individuales para nodos faltantes...")
            EXTRACTION_JOBS[job_id] = {'status': 'pending', 'progress': 72, 'message': f'Recuperando {len(missing_leaf_ids)} elementos faltantes...'}
            
            # Intentar recuperar las propiedades de los nodos faltantes en lotes
            missing_list = list(missing_leaf_ids)
            BATCH = 50
            recovered = 0
            for i in range(0, len(missing_list), BATCH):
                batch_ids = missing_list[i:i+BATCH]
                try:
                    q_url = f"{APS_MD_URL}/{urn}/metadata/{guid}/properties:query"
                    q_payload = {
                        'query': {'$in': ['objectid'] + batch_ids}
                    }
                    q_resp = requests.post(q_url, headers={**headers, 'Content-Type': 'application/json'}, json=q_payload, timeout=30)
                    if q_resp.status_code == 200:
                        batch_results = q_resp.json().get('data', {}).get('collection', [])
                        collection.extend(batch_results)
                        recovered += len(batch_results)
                except Exception as gap_err:
                    print(f"[Extractor] Fase 2.2 - Error recuperando lote {i//BATCH}: {gap_err}")
            print(f"[Extractor] Fase 2.2 - Recuperados {recovered}/{len(missing_leaf_ids)} elementos faltantes")
        else:
            print(f"[Extractor] Fase 2.2 - [OK] Cobertura completa: {len(tree_leaf_ids)} hojas, todas presentes en collection")

        # Fase 3: Inserción BD y Fusión Genética
        EXTRACTION_JOBS[job_id] = {'status': 'pending', 'progress': 80, 'message': 'Estructurando gemelo digital (Fusionando Familias)...'}
        
        props_by_id = {node.get('objectid'): node.get('properties', {}) for node in collection}
        names_by_id = {node.get('objectid'): node.get('name', 'Unnamed') for node in collection}
        # Enriquecer names_by_id con nombres del árbol (más completo que el collection)
        for oid, oname in tree_all_nodes.items():
            if oid not in names_by_id:
                names_by_id[oid] = oname
        
        import copy
        def deep_merge(target, source):
            for k, v in source.items():
                if isinstance(v, dict):
                    if k not in target or not isinstance(target[k], dict):
                        target[k] = {}
                    deep_merge(target[k], v)
                else:
                    val_src = str(v).strip() if v is not None else ''
                    if val_src != '' and val_src != 'None':
                        target[k] = copy.deepcopy(v)

        inventory_data = []
        skipped_nodes = 0
        seen_external_ids = set()  # Deduplicación integral por externalId
        for node in collection:
            name = node.get('name', 'Unnamed')
            external_id = node.get('externalId')
            objectid = node.get('objectid')
            if not external_id:
                print(f"[Extractor] [!] Nodo sin externalId descartado: objectid={objectid}, name={name}")
                continue
                
            ancestral_path = []
            curr_id = parent_map.get(objectid)
            while curr_id is not None:
                ancestral_path.append(curr_id)
                curr_id = parent_map.get(curr_id)
            ancestral_path.reverse()
            
            merged_props = {}
            for anc_id in ancestral_path:
                anc_props = props_by_id.get(anc_id, {})
                deep_merge(merged_props, anc_props)
                
            my_props = node.get('properties', {})
            deep_merge(merged_props, my_props)

            # --- LIMPIEZA DE RUIDO (CIVIL 3D) ---
            # Eliminar grupos matemáticos irrelevantes para aligerar la base de datos
            keys_to_remove = [k for k in merged_props.keys() if k.startswith('Sub-entity')]
            for k in keys_to_remove:
                del merged_props[k]

            # --- DEDUPLICAR PREFIJO DE GRUPO EN NOMBRES DE PROPIEDADES (Civil 3D) ---
            # Civil 3D exporta propiedades como:
            #   "SCL_Datos_Metrados": { "SCL_Datos_Metrados - 01_13_DSI_Zona": "DRENAJE URBANO" }
            # El nombre ya contiene el grupo como prefijo. Lo limpiamos:
            #   "SCL_Datos_Metrados": { "01_13_DSI_Zona": "DRENAJE URBANO" }
            cleaned_props = {}
            for group_name, group_vals in merged_props.items():
                if not isinstance(group_vals, dict):
                    cleaned_props[group_name] = group_vals
                    continue
                cleaned_group = {}
                prefix1 = group_name + ' - '   # "SCL_Datos_Metrados - "
                prefix2 = group_name + ' – '   # En dash variant
                prefix3 = group_name + ' — '   # Em dash variant
                for prop_name, prop_val in group_vals.items():
                    clean_name = prop_name
                    import re
                    if prop_name.startswith(group_name) and len(prop_name) > len(group_name):
                        candidate = re.sub(r'^[\\s\\-\\_\\.]+', '', prop_name[len(group_name):])
                        if candidate:
                            clean_name = candidate
                    elif group_name.upper() == 'PROPERTY SETS':
                        match = re.match(r'^.*?\\s*[\\-\\u2013\\u2014]\\s*(.+)$', prop_name)
                        if match:
                            clean_name = match.group(1)
                    cleaned_group[clean_name] = prop_val
                cleaned_props[group_name] = cleaned_group
            merged_props = cleaned_props

            # Inyectar Category Topológico (Modelo SVF)
            # ancestral_path = [Root(0), Category(1), Family(2), Type(3)] 
            # Si se agrupó por niveles = [Root(0), Level(1), Category(2)]
            path_names = [names_by_id.get(anc_id, 'Unnamed') for anc_id in ancestral_path]
            
            revit_cat = '(Unassigned)'
            if len(path_names) > 1:
                candidate = path_names[1]
                # Si path_names[1] es un nombre de archivo (linked model),
                # buscar la categoría real más profundamente en la jerarquía.
                if _is_filename(candidate) and len(path_names) > 2:
                    candidate = path_names[2]
                revit_cat = candidate
            
            # Fallback: si todavía no tenemos categoría válida, intentar
            # leer de las propiedades del elemento (Item::Category o Elemento::Categoría)
            if revit_cat == '(Unassigned)' or _is_filename(revit_cat):
                item_cat = merged_props.get('Item', {}).get('Category', '')
                elem_cat = merged_props.get('Elemento', {}).get('Categoría', '')
                identity_cat = merged_props.get('Datos de identidad', {}).get('Categoría', '')
                for fallback in [item_cat, elem_cat, identity_cat]:
                    if fallback and str(fallback).strip() and str(fallback).strip() != '(Unassigned)':
                        revit_cat = str(fallback).strip()
                        break

            # Normalizar: ES→EN y linked models
            revit_cat = normalize_revit_category(revit_cat)

            # Inyectamos en la estructura que el frontend espera
            if '__category__' not in merged_props:
                merged_props['__category__'] = {}
            merged_props['__category__']['__category__'] = revit_cat
            
            # ═══════════════════════════════════════════════════════════
            # CLASIFICACIÓN INTEGRAL DE NODOS SVF
            # Prioridad 1: Si el nodo es PADRE de otros → es tipo/familia (NUNCA instancia)
            # Prioridad 2: Si es hoja del árbol → es instancia geométrica
            # Prioridad 3: Regex de nombre con [ID] → instancia (Revit/Civil3D)
            # Prioridad 4: ExternalId con ':' → categoría agrupadora
            # Prioridad 5: IFC con IfcGUID → instancia
            # Esta lógica funciona para TODAS las categorías de Revit
            # sin necesidad de filtros específicos por nombre.
            # ═══════════════════════════════════════════════════════════
            import re
            if objectid in tree_parent_ids:
                # INTEGRAL: Nodo padre → NUNCA es instancia física
                # Cubre: Tipos de tubería, Tipos de muro, Tipos de piso, etc.
                node_type = 'type'
            elif objectid in tree_leaf_ids:
                node_type = 'instance'
            elif re.search(r'\[[\dA-Fa-f]+\]', name):
                node_type = 'instance'
            elif ':' in external_id and not external_id.startswith('urn:'):
                node_type = 'category'
            elif 'IfcGUID' in merged_props.get('Element', {}):
                node_type = 'instance'  # IFC elements son instancias geométricas reales
            else:
                node_type = 'type'
            
            if '__node__' not in merged_props:
                merged_props['__node__'] = {}
            merged_props['__node__']['__node_type__'] = node_type
            
            # ═══════════════════════════════════════════════════════════
            # FILTRO DE COHERENCIA: Solo almacenar instancias geométricas
            # Los nodos 'type' y 'category' son artefactos del árbol SVF:
            #   - 'type':     Definición de familia (e.g., "000_SYP_Empedrado")
            #                 → Sus propiedades YA están heredadas por las instancias
            #                   gracias a la Fusión Genética (deep_merge ancestral).
            #   - 'category': Nodo agrupador (e.g., "Muros:", "Walls")
            #                 → Sin valor para auditoría.
            # Las instancias contienen toda la metadata de auditoría:
            #   Dimensions (Area, Volume, Length), Data (DSI_*), Constraints, etc.
            # ═══════════════════════════════════════════════════════════
            if node_type != 'instance':
                skipped_nodes += 1
                continue

            # --- FILTRO DE ELEMENTOS FANTASMAS (SISTEMAS/ANALÍTICOS) ---
            # Revit exporta lógicas analíticas invisibles (Piping Systems, Lines) 
            # que duplican la data (Length, Partida) del elemento físico principal.
            # Bloqueamos su ingreso a la BD para mantener la pureza de los metrados.
            BLACKLIST_CATEGORIES = {
                'Lines', 'Piping Systems', 'Duct Systems', 
                'Analytical Models', 'Pipe Insulations'
            }
            # revit_cat ya fue normalizado (ES->EN) en el paso previo
            if revit_cat in BLACKLIST_CATEGORIES:
                skipped_nodes += 1
                continue
            
            # --- FILTRO INTEGRAL: CENTERLINES MEP (REVIT) ---
            # En Revit, cada tubería/conducto genera DOS nodos SVF:
            #   1. La geometría 3D (tubería física) → tiene "Nombre de tipo"
            #   2. Su línea de eje (centerline) → NO tiene "Nombre de tipo"
            # Ambos heredan los mismos parámetros DSI, causando conteo doble.
            # Solución: descartar nodos MEP que carezcan de Type Name.
            MEP_CATEGORIES = {'Pipes', 'Pipe Fittings', 'Ducts', 'Duct Fittings',
                              'Cable Trays', 'Conduits', 'Flex Pipes', 'Flex Ducts'}
            if revit_cat in MEP_CATEGORIES:
                identity = merged_props.get('Datos de identidad', merged_props.get('Identity Data', {}))
                type_name = identity.get('Nombre de tipo', identity.get('Type Name', ''))
                if not type_name:
                    skipped_nodes += 1
                    continue
            
            inventory_data.append({
                "name": name,
                "external_id": external_id,
                "properties": json.dumps(merged_props)
            })

        print(f"[Extractor] Fase 3 - {len(inventory_data)} instancias geométricas para insertar ({skipped_nodes} nodos type/category descartados)")

        if not inventory_data:
            EXTRACTION_JOBS[job_id] = {'status': 'success', 'progress': 100, 'message': 'El modelo no contiene objetos con ID.'}
            print(f"[Extractor] Sin objetos con ID. Finalizando.")
            return

        from db import get_db_connection
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # WIPE QUIRÚRGICO: Elimina versiones históricas para no acumular basura en PostgreSQL
            import base64
            def get_base_urn(b64_urn):
                try:
                    padded = b64_urn + '=' * (-len(b64_urn) % 4)
                    url_safe = padded.replace('-', '+').replace('_', '/')
                    decoded = base64.b64decode(url_safe).decode('utf-8')
                    return decoded.split('?')[0]
                except Exception:
                    return b64_urn
            
            # SEGURIDAD: la purga es LOCAL al scope destino (model_urn = target_urn).
            # Antes barria toda la tabla por lineage, lo que podia borrar el inventario
            # del frente real al extraer una version vieja a un scope temporal de
            # comparacion ('__cmp__'). Dentro del frente, el comportamiento es identico.
            base_urn_to_delete = get_base_urn(urn)
            cursor.execute("SELECT DISTINCT source_urn FROM inventory_assets WHERE model_urn = %s", (target_urn,))
            all_source_urns = cursor.fetchall()
            urns_to_delete = []
            for (s_urn,) in all_source_urns:
                if get_base_urn(s_urn) == base_urn_to_delete:
                    urns_to_delete.append(s_urn)

            if urns_to_delete:
                format_strings = ','.join(['%s'] * len(urns_to_delete))
                print(f"[Extractor] Eliminando {len(urns_to_delete)} versiones historicas del archivo (scope {target_urn}).")
                cursor.execute(f"DELETE FROM inventory_assets WHERE model_urn = %s AND source_urn IN ({format_strings})", [target_urn] + urns_to_delete)

            current_time = datetime.now()
            from db import resolve_project_id
            project_id = resolve_project_id(target_urn)  # obra canonica (Pilar Identidad)
            records = [
                (item['external_id'], target_urn, urn, item['name'], item['properties'], current_time, project_id)
                for item in inventory_data
            ]

            from psycopg2.extras import execute_values
            insert_query = """
                INSERT INTO inventory_assets (external_id, model_urn, source_urn, name, properties, last_updated, project_id)
                VALUES %s
                ON CONFLICT (model_urn, source_urn, external_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    properties = EXCLUDED.properties,
                    last_updated = EXCLUDED.last_updated,
                    project_id = EXCLUDED.project_id;
            """
            execute_values(cursor, insert_query, records)
            conn.commit()

        EXTRACTION_JOBS[job_id] = {'status': 'success', 'progress': 100, 'message': f'Extracción completa. {len(inventory_data)} activos insertados.'}
        print(f"[Extractor] COMPLETADO: {len(inventory_data)} activos insertados en PostgreSQL")
        print(f"[Extractor] ===== FIN JOB: {job_id} =====\n")

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[Extractor ERROR] {e}")
        EXTRACTION_JOBS[job_id] = {'status': 'error', 'progress': 0, 'message': str(e)}


@inventory_bp.route('/api/inventory/extract', methods=['POST'])
def start_extraction():
    data = request.get_json() or {}
    urn = data.get('urn')
    target_urn = data.get('target_urn') or urn
    
    if not urn:
        return jsonify({'error': 'Missing urn'}), 400

    # Sanitize job_id: replace / with _ to avoid breaking Flask URL routing
    safe_urn = urn.replace('/', '_').replace('+', '-')
    job_id = f"job_{safe_urn}_{int(time.time())}"
    
    # Iniciar hilo secundario
    thread = threading.Thread(target=extract_metadata_task, args=(urn, target_urn, job_id))
    thread.daemon = True
    thread.start()
    
    return jsonify({'job_id': job_id}), 202


@inventory_bp.route('/api/inventory/extract/status/<job_id>', methods=['GET'])
def get_extraction_status(job_id):
    job = EXTRACTION_JOBS.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
        
    return jsonify({
        'status': job['status'],
        'progress': job['progress'],
        'message': job['message']
    })


@inventory_bp.route('/api/inventory/viewables/<path:urn>', methods=['GET'])
def get_model_viewables(urn):
    """
    Consulta las vistas publicadas (viewables) de un modelo ya traducido en ACC.
    Devuelve la lista de vistas 3D y 2D con su GUID y nombre.
    """
    try:
        from urllib.parse import unquote
        urn = unquote(urn)  # Decode %2F -> / etc.
        urn = sanitize_urn(urn)  # Convert to URL-safe base64
        
        token_result = get_internal_token()
        if isinstance(token_result, tuple):
            token, err = token_result
            if err:
                return jsonify({'error': f'Token error: {err}'}), 500
        else:
            token = token_result

        url = f"{APS_MD_URL}/{urn}/metadata"
        headers = {'Authorization': f'Bearer {token}'}
        
        print(f"[Viewables] Fetching: {url}")
        resp = requests.get(url, headers=headers)
        
        if resp.status_code == 202:
            return jsonify({'views': [], 'message': 'Model still processing'}), 202
        if resp.status_code == 401:
            return jsonify({'error': 'Autodesk token expired or invalid'}), 401
        resp.raise_for_status()
        
        metadata = resp.json().get('data', {}).get('metadata', [])
        
        views = []
        for view in metadata:
            views.append({
                'guid': view.get('guid'),
                'name': view.get('name', 'Unnamed View'),
                'role': view.get('role', 'unknown'),
                'is3D': view.get('role') == '3d'
            })
        
        print(f"[Viewables] Found {len(views)} views for URN: {urn[:40]}...")
        return jsonify({'views': views})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[Viewables Error] {e}")
        return jsonify({'error': str(e)}), 500

