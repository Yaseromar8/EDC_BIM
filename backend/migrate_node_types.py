"""
Fast migration: Classify existing inventory nodes using pure SQL.
No row-by-row updates - uses jsonb_set with pattern matching.
"""
from dotenv import load_dotenv
import pathlib
load_dotenv(pathlib.Path(r'd:\VISOR_APS_TL\.env'))

from db import init_db_pool, get_db_connection
init_db_pool()

with get_db_connection() as conn:
    cur = conn.cursor()
    cur.execute("SET statement_timeout = '300000'")  # 5 min
    
    # Count before
    cur.execute("SELECT COUNT(*) FROM inventory_assets WHERE NOT (properties::text LIKE '%__node_type__%')")
    total = cur.fetchone()[0]
    print(f"Records to classify: {total}")
    
    if total == 0:
        print("All records already classified. Done.")
        exit(0)
    
    # 1. Classify INSTANCES: name contains [digits] pattern
    print("Classifying instances (name LIKE '%[%]%')...")
    cur.execute("""
        UPDATE inventory_assets 
        SET properties = jsonb_set(
            COALESCE(properties, '{}'::jsonb),
            '{__node__}',
            '{"__node_type__": "instance"}'::jsonb,
            true
        )
        WHERE name ~ '\\[\\d+\\]'
          AND NOT (properties::text LIKE '%__node_type__%')
    """)
    instances = cur.rowcount
    print(f"  -> {instances} instances classified")
    
    # 2. Classify CATEGORIES: external_id contains ':' (not starting with 'urn:')
    print("Classifying categories (external_id LIKE '%:%')...")
    cur.execute("""
        UPDATE inventory_assets 
        SET properties = jsonb_set(
            COALESCE(properties, '{}'::jsonb),
            '{__node__}',
            '{"__node_type__": "category"}'::jsonb,
            true
        )
        WHERE external_id LIKE '%:%'
          AND external_id NOT LIKE 'urn:%'
          AND NOT (properties::text LIKE '%__node_type__%')
    """)
    categories = cur.rowcount
    print(f"  -> {categories} categories classified")
    
    # 3. Classify remaining as TYPES
    print("Classifying types (remaining)...")
    cur.execute("""
        UPDATE inventory_assets 
        SET properties = jsonb_set(
            COALESCE(properties, '{}'::jsonb),
            '{__node__}',
            '{"__node_type__": "type"}'::jsonb,
            true
        )
        WHERE NOT (properties::text LIKE '%__node_type__%')
    """)
    types = cur.rowcount
    print(f"  -> {types} types classified")
    
    conn.commit()
    
    print(f"\nDone!")
    print(f"  Instance: {instances}")
    print(f"  Category: {categories}")
    print(f"  Type:     {types}")
    print(f"  Total:    {instances + categories + types}")
