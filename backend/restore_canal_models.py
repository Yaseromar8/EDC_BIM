"""
Restore Canal models to PostgreSQL model_config table.
These models existed before but were lost from the DB.
"""
import os, pathlib
from dotenv import load_dotenv

_env_found = load_dotenv()
if not _env_found:
    _parent_env = pathlib.Path(__file__).resolve().parent.parent / '.env'
    load_dotenv(_parent_env)

from db import get_db_connection

# Models to restore (from the original local config)
canal_models = [
    {
        'id': '1771827732247',
        'name': '500125-CSSP001-740-XX-DR-TP-004121@004146.rvt',
        'urn': 'dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLnJ0TzE3c2tsU0h1djJyYzhoLVppaHc/dmVyc2lvbj02',
        'source': 'DOCS',
        'region': 'US',
        'projectId': 'b.3fcc21c3-6d58-45bb-8057-ab3352b1b58f',
        'itemId': 'urn:adsk.wipprod:dm.lineage:rtO17sklSHuv2rc8h-Zihw',
        'versionId': 'urn:adsk.wipprod:fs.file:vf.rtO17sklSHuv2rc8h-Zihw?version=6',
        'versionNumber': 6,
        'lastModifiedTime': '2026-02-19T21:44:29.0000000Z',
        'appProjectId': 'CANAL',
    },
    {
        'id': '1772172956144',
        'name': '500125-CSSP001-780-XX-DR-HD-011264@011268.rvt',
        'urn': 'dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLkJ4RkxyZi1vU1F5YWtnZ3B3YmdLNGc/dmVyc2lvbj0yMA',
        'source': 'DOCS',
        'region': 'US',
        'projectId': 'b.3fcc21c3-6d58-45bb-8057-ab3352b1b58f',
        'itemId': 'urn:adsk.wipprod:dm.lineage:BxFLrf-oSQyakggpwbgK4g',
        'versionId': 'urn:adsk.wipprod:fs.file:vf.BxFLrf-oSQyakggpwbgK4g?version=20',
        'versionNumber': 20,
        'lastModifiedTime': '2026-02-23T22:36:26.0000000Z',
        'appProjectId': '1_CANAL',
    },
]

# Also restore the DRENAJE_URBANO models that may be missing
drenaje_models = [
    {
        'id': '1771827151548',
        'name': '500125-CSSP001-780-XX-DR-HD-011259@011263.rvt',
        'urn': 'dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLnJyV05tX28zUlhLWFJsNlZGdzQ5ZGc/dmVyc2lvbj00',
        'source': 'DOCS',
        'region': 'US',
        'projectId': 'b.3fcc21c3-6d58-45bb-8057-ab3352b1b58f',
        'itemId': 'urn:adsk.wipprod:dm.lineage:rrWNm_o3RXKXRl6VFw49dg',
        'versionId': 'urn:adsk.wipprod:fs.file:vf.rrWNm_o3RXKXRl6VFw49dg?version=4',
        'versionNumber': 4,
        'lastModifiedTime': '2026-02-13T14:22:18.0000000Z',
        'appProjectId': 'DRENAJE_URBANO',
    },
    {
        'id': '1771827152424',
        'name': '500125-CSSP001-780-XX-DR-HD-011264@011268.rvt',
        'urn': 'dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLkJ4RkxyZi1vU1F5YWtnZ3B3YmdLNGc/dmVyc2lvbj0xOA',
        'source': 'DOCS',
        'region': 'US',
        'projectId': 'b.3fcc21c3-6d58-45bb-8057-ab3352b1b58f',
        'itemId': 'urn:adsk.wipprod:dm.lineage:BxFLrf-oSQyakggpwbgK4g',
        'versionId': 'urn:adsk.wipprod:fs.file:vf.BxFLrf-oSQyakggpwbgK4g?version=18',
        'versionNumber': 18,
        'lastModifiedTime': '2026-02-17T13:54:49.0000000Z',
        'appProjectId': 'DRENAJE_URBANO',
    },
    {
        'id': '1771827153584',
        'name': '500125-CSSP001-780-XX-DR-ST-011242@011244.rvt',
        'urn': 'dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLnpWOE5LU2pzVDRxcUxLQ2plUm1pSEE/dmVyc2lvbj00',
        'source': 'DOCS',
        'region': 'US',
        'projectId': 'b.3fcc21c3-6d58-45bb-8057-ab3352b1b58f',
        'itemId': 'urn:adsk.wipprod:dm.lineage:zV8NKSjsT4qqLKCjeRmiHA',
        'versionId': 'urn:adsk.wipprod:fs.file:vf.zV8NKSjsT4qqLKCjeRmiHA?version=4',
        'versionNumber': 4,
        'lastModifiedTime': '2026-02-13T14:24:22.0000000Z',
        'appProjectId': 'DRENAJE_URBANO',
    },
]

# Also restore the NWC model
nwc_model = {
    'id': '1772170982347',
    'name': '500125-CSSP001-780-XX-DR-HD-011264@011268.nwc',
    'urn': 'dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLm1IeUtxQ0ozU2NDcmVXYXVZWWZXWnc/dmVyc2lvbj0x',
    'source': 'DOCS',
    'region': 'US',
    'projectId': 'b.3fcc21c3-6d58-45bb-8057-ab3352b1b58f',
    'itemId': 'urn:adsk.wipprod:dm.lineage:mHyKqCJ3ScCreWauYYfWZw',
    'versionId': 'urn:adsk.wipprod:fs.file:vf.mHyKqCJ3ScCreWauYYfWZw?version=1',
    'versionNumber': 1,
    'lastModifiedTime': '2026-01-26T04:51:54.0000000Z',
    'appProjectId': '1',
}

all_models = canal_models + drenaje_models + [nwc_model]

def restore():
    print("=" * 60)
    print("RESTAURACION DE MODELOS EN model_config (PostgreSQL)")
    print("=" * 60)
    
    # First, show what's currently in the table
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT model_id, name, app_project_id FROM model_config ORDER BY app_project_id")
        existing = cursor.fetchall()
        
        print(f"\n[INFO] Modelos ACTUALES en la tabla ({len(existing)}):")
        for r in existing:
            print(f"   [{r[2]:20s}] {r[1]}")
        
        existing_ids = {r[0] for r in existing}
    
    # Insert missing models
    inserted = 0
    skipped = 0
    with get_db_connection() as conn:
        cursor = conn.cursor()
        for model in all_models:
            if model['id'] in existing_ids:
                print(f"   [SKIP] (ya existe): [{model['appProjectId']}] {model['name']}")
                skipped += 1
                continue
            
            cursor.execute('''
                INSERT INTO model_config
                    (model_id, name, urn, source, region, project_id, item_id,
                     version_id, version_number, last_modified_time, app_project_id, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (model_id) DO NOTHING
            ''', (
                model['id'], model['name'], model['urn'],
                model['source'], model['region'],
                model['projectId'], model['itemId'],
                model['versionId'], model['versionNumber'],
                model['lastModifiedTime'], model['appProjectId']
            ))
            inserted += 1
            print(f"   [OK] INSERTADO: [{model['appProjectId']}] {model['name']}")
        
        conn.commit()
    
    # Verify final state
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT model_id, name, app_project_id FROM model_config ORDER BY app_project_id")
        final = cursor.fetchall()
        
        print(f"\n[FINAL] Modelos en la tabla ({len(final)}):")
        for r in final:
            print(f"   [{r[2]:20s}] {r[1]}")
    
    print(f"\n[DONE] Insertados: {inserted} | Omitidos: {skipped} | Total final: {len(final)}")

if __name__ == '__main__':
    restore()
