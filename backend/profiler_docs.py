"""
Profiler: Mide exactamente dónde se queman los segundos en /api/docs/list.
Ejecutar mientras server.py está corriendo en puerto 3000.
"""
import time
import os
import sys

# Load env same as server.py
from dotenv import load_dotenv
import pathlib
_env_found = load_dotenv()
if not _env_found:
    _parent_env = pathlib.Path(__file__).resolve().parent.parent / '.env'
    load_dotenv(_parent_env)

from db import init_db_pool, get_db_connection
from file_system_db import list_contents, resolve_path_to_node_id
from auth_middleware import validate_session

# ========= CONFIGURACIÓN =========
MODEL_URN = "proyectos/PQT8_TALARA"
TEST_PATH = "proyectos/PQT8_TALARA/"
ITERATIONS = 3

def main():
    print("=" * 60)
    print("PROFILER: Análisis de latencia /api/docs/list")
    print("=" * 60)

    # 1. Pool init
    t0 = time.time()
    init_db_pool()
    t1 = time.time()
    print(f"\n[1] DB Pool init: {(t1-t0)*1000:.1f}ms")

    # 2. Auth validation (simulated)
    print(f"\n[2] Auth middleware (validate_session):")
    # Get a real session token from the DB
    with get_db_connection() as conn:
        cursor = conn.cursor()
        # Ya NO se puede sacar un token usable de la base: la columna guarda la
        # HUELLA, no el token. Que este script funcionara era, de hecho, el mismo
        # problema que se queria cerrar -- cualquiera con lectura sobre la base
        # se hacia con una sesion ajena. Para medir, pega aqui un token propio.
        token = os.getenv('PROFILER_SESSION_TOKEN')
        row = [token] if token else None
        if row:
            for i in range(ITERATIONS):
                ta = time.time()
                user = validate_session(token)
                tb = time.time()
                print(f"   Iter {i+1}: {(tb-ta)*1000:.1f}ms -> user={user.get('name') if user else 'None'}")
        else:
            print("   Define PROFILER_SESSION_TOKEN con un token propio para medir.")
            return

    # 3. resolve_path_to_node_id
    print(f"\n[3] resolve_path_to_node_id('{TEST_PATH}'):")
    for i in range(ITERATIONS):
        ta = time.time()
        node_id = resolve_path_to_node_id(TEST_PATH, MODEL_URN, auto_create=False)
        tb = time.time()
        print(f"   Iter {i+1}: {(tb-ta)*1000:.1f}ms -> node_id={node_id}")

    # 4. ensure_project_root_node
    from file_system_db import ensure_project_root_node
    print(f"\n[4] ensure_project_root_node('{MODEL_URN}'):")
    for i in range(ITERATIONS):
        ta = time.time()
        root_id = ensure_project_root_node(MODEL_URN)
        tb = time.time()
        print(f"   Iter {i+1}: {(tb-ta)*1000:.1f}ms -> root_id={root_id}")

    # 5. list_contents (raíz del proyecto)
    parent_id = root_id or node_id
    print(f"\n[5] list_contents(parent_id={parent_id}, '{MODEL_URN}'):")
    for i in range(ITERATIONS):
        ta = time.time()
        contents = list_contents(parent_id, MODEL_URN, TEST_PATH, user=user)
        tb = time.time()
        nf = len(contents.get('folders', []))
        nfiles = len(contents.get('files', []))
        print(f"   Iter {i+1}: {(tb-ta)*1000:.1f}ms -> {nf} folders, {nfiles} files")

    # 6. Get IDs of subfolders and test deeper navigation
    folders = contents.get('folders', [])
    if folders:
        # Test first subfolder
        sub = folders[0]
        sub_id = sub['id']
        sub_name = sub['name']
        print(f"\n[6] list_contents(subfolder='{sub_name}', id={sub_id}):")
        for i in range(ITERATIONS):
            ta = time.time()
            sub_contents = list_contents(sub_id, MODEL_URN, f"{TEST_PATH}{sub_name}/", user=user)
            tb = time.time()
            nf = len(sub_contents.get('folders', []))
            nfiles = len(sub_contents.get('files', []))
            print(f"   Iter {i+1}: {(tb-ta)*1000:.1f}ms -> {nf} folders, {nfiles} files")
    
    # 7. Signed URL generation (the loop in documents.py)
    from gcs_manager import generate_signed_url
    print(f"\n[7] generate_signed_url (single call):")
    # Find a file with gcs_urn
    all_files = contents.get('files', [])
    if not all_files and folders:
        all_files = sub_contents.get('files', [])
    
    if all_files:
        test_file = all_files[0]
        gcs_urn = test_file.get('gcs_urn', '')
        print(f"   Testing with: {gcs_urn[:60]}...")
        for i in range(ITERATIONS):
            ta = time.time()
            url = generate_signed_url(gcs_urn)
            tb = time.time()
            print(f"   Iter {i+1}: {(tb-ta)*1000:.1f}ms -> {'OK' if url else 'FAILED'}")
    else:
        print("   No files found to test signed URLs")

    # 8. Full pipeline simulation
    print(f"\n{'='*60}")
    print("[8] FULL PIPELINE (auth + resolve + list + signed URLs):")
    print(f"{'='*60}")
    for i in range(ITERATIONS):
        ta = time.time()
        
        # Auth
        t_auth_start = time.time()
        u = validate_session(token)
        t_auth_end = time.time()
        
        # Resolve path
        t_resolve_start = time.time()
        pid = resolve_path_to_node_id(TEST_PATH, MODEL_URN, auto_create=False)
        t_resolve_end = time.time()
        
        # Ensure root
        t_root_start = time.time()
        rid = ensure_project_root_node(MODEL_URN)
        t_root_end = time.time()
        
        final_id = rid or pid
        
        # List
        t_list_start = time.time()
        c = list_contents(final_id, MODEL_URN, TEST_PATH, user=u)
        t_list_end = time.time()
        
        # Signed URLs
        t_sign_start = time.time()
        for f in c.get('files', []):
            if f.get('gcs_urn'):
                generate_signed_url(f['gcs_urn'])
        t_sign_end = time.time()
        
        tb = time.time()
        
        print(f"   Iter {i+1} TOTAL: {(tb-ta)*1000:.1f}ms")
        print(f"      Auth:       {(t_auth_end-t_auth_start)*1000:.1f}ms")
        print(f"      Resolve:    {(t_resolve_end-t_resolve_start)*1000:.1f}ms")
        print(f"      Root:       {(t_root_end-t_root_start)*1000:.1f}ms")
        print(f"      List:       {(t_list_end-t_list_start)*1000:.1f}ms")
        print(f"      SignedURLs: {(t_sign_end-t_sign_start)*1000:.1f}ms ({len(c.get('files',[]))} files)")

    # 9. Check indexes
    print(f"\n{'='*60}")
    print("[9] DATABASE INDEXES on file_nodes:")
    print(f"{'='*60}")
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'file_nodes'")
        for row in cursor.fetchall():
            print(f"   {row[0]}")
        
        # Count total rows
        cursor.execute("SELECT COUNT(*) FROM file_nodes WHERE model_urn = %s AND is_deleted = FALSE", (MODEL_URN,))
        total = cursor.fetchone()[0]
        print(f"\n   Total active nodes in '{MODEL_URN}': {total}")

        # EXPLAIN ANALYZE the main query
        print(f"\n[10] EXPLAIN ANALYZE for list_contents query:")
        cursor.execute("""
            EXPLAIN ANALYZE
            SELECT id, name, node_type, size_bytes, version_number, updated_at, gcs_urn, 
                   status, tags, metadata, description, mime_type, 
                   COALESCE(updated_by, created_by, 'Sistema') as u_by,
                   NULL as permission_level,
                   EXISTS(SELECT 1 FROM file_nodes c WHERE c.model_urn = file_nodes.model_urn AND c.parent_id = file_nodes.id AND c.is_deleted = FALSE) AS has_children
            FROM file_nodes 
            WHERE model_urn = %s AND parent_id = %s AND is_deleted = FALSE
            ORDER BY node_type DESC, name ASC
        """, (MODEL_URN, str(final_id)))
        for row in cursor.fetchall():
            print(f"   {row[0]}")

if __name__ == '__main__':
    main()
