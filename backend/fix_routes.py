import sys
path = r'd:\VISOR_APS_TL\backend\routes\digital_twin.py'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace(
'''    config = get_project_config_internal()
    initial_len = len(config.get('models', []))
    config['models'] = [m for m in config.get('models', []) if m.get('urn') != urn]
    
    if len(config['models']) < initial_len:
        # Delete model config from DB
        delete_model_from_db(urn)''',
'''    config = get_project_config_internal()
    initial_len = len(config.get('models', []))
    
    if app_project_id:
        config['models'] = [m for m in config.get('models', []) if not (m.get('urn') == urn and m.get('appProjectId') == app_project_id)]
    else:
        config['models'] = [m for m in config.get('models', []) if m.get('urn') != urn]
    
    if len(config['models']) < initial_len:
        # Delete model config from DB
        delete_model_from_db(urn, app_project_id)'''
)

text = text.replace(
'''                # 3. Fallback: buscar por model_urn (appProjectId) + source_urn
                if deleted_count == 0 and app_project_id:
                    cursor.execute(
                        "DELETE FROM inventory_assets WHERE model_urn = %s AND source_urn IN (%s, %s)",
                        (app_project_id, urn_sanitized, urn)
                    )
                    deleted_count = cursor.rowcount''',
''''''
)

text = text.replace(
'''                # 1. Intentar con URN sanitizado (como lo guarda extract_metadata_task)
                cursor.execute(
                    "DELETE FROM inventory_assets WHERE source_urn = %s",
                    (urn_sanitized,)
                )
                deleted_count = cursor.rowcount
                
                # 2. Si no encontró nada, intentar con URN raw (por si hay datos legacy)
                if deleted_count == 0 and urn != urn_sanitized:
                    cursor.execute(
                        "DELETE FROM inventory_assets WHERE source_urn = %s",
                        (urn,)
                    )
                    deleted_count = cursor.rowcount''',
'''                # 1. Intentar con URN sanitizado (como lo guarda extract_metadata_task)
                if app_project_id:
                    cursor.execute("DELETE FROM inventory_assets WHERE source_urn = %s AND model_urn = %s", (urn_sanitized, app_project_id))
                else:
                    cursor.execute("DELETE FROM inventory_assets WHERE source_urn = %s", (urn_sanitized,))
                deleted_count = cursor.rowcount
                
                # 2. Si no encontró nada, intentar con URN raw (por si hay datos legacy)
                if deleted_count == 0 and urn != urn_sanitized:
                    if app_project_id:
                        cursor.execute("DELETE FROM inventory_assets WHERE source_urn = %s AND model_urn = %s", (urn, app_project_id))
                    else:
                        cursor.execute("DELETE FROM inventory_assets WHERE source_urn = %s", (urn,))
                    deleted_count = cursor.rowcount'''
)

text = text.replace(
'''    for m in config.get('models', []):
        if m['urn'] == old_urn:
            m['urn'] = new_data.get('urn')''',
'''    for m in config.get('models', []):
        if m['urn'] == old_urn and m.get('appProjectId') == app_project_id:
            m['urn'] = new_data.get('urn')'''
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
print('Done!')
