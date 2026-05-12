from db import get_db_connection
with get_db_connection() as conn:
    cur = conn.cursor()
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='model_config' ORDER BY ordinal_position")
    print("Columns:", [r[0] for r in cur.fetchall()])

    # Also check what's stored
    try:
        cur.execute("SELECT urn, name, default_view_guid FROM model_config LIMIT 5")
        for r in cur.fetchall():
            print(f"  URN: {r[0][:40]}... | Name: {r[1]} | defaultViewGuid: {r[2]}")
    except Exception as e:
        print(f"  Error querying default_view_guid: {e}")
        cur.execute("SELECT urn, name FROM model_config LIMIT 5")
        for r in cur.fetchall():
            print(f"  URN: {r[0][:40]}... | Name: {r[1]}")
