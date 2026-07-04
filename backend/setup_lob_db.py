import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(
    dbname=os.environ.get('DB_NAME', 'bim_digital_twin'),
    user=os.environ.get('DB_USER', 'postgres'),
    password=os.environ.get('DB_PASS', 'postgres'),
    host=os.environ.get('DB_HOST', 'localhost'),
    port=os.environ.get('DB_PORT', '5432')
)
cur = conn.cursor()

# Create table lob_schedule_tasks
cur.execute("""
    CREATE TABLE IF NOT EXISTS lob_schedule_tasks (
        id SERIAL PRIMARY KEY,
        task_name TEXT NOT NULL,
        color TEXT DEFAULT '#ff0000',
        project_id TEXT,
        time_domain TSRANGE,
        station_domain NUMRANGE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
""")

# Create GiST index for time_domain
cur.execute("""
    CREATE INDEX IF NOT EXISTS idx_lob_schedule_tasks_time 
    ON lob_schedule_tasks USING GIST (time_domain);
""")

# Create GiST index for station_domain
cur.execute("""
    CREATE INDEX IF NOT EXISTS idx_lob_schedule_tasks_station 
    ON lob_schedule_tasks USING GIST (station_domain);
""")

# Try adding physical_station_range to inventory_assets
try:
    cur.execute("""
        ALTER TABLE inventory_assets 
        ADD COLUMN IF NOT EXISTS physical_station_range NUMRANGE;
    """)
    # Add GiST index for physical_station_range
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_inventory_assets_station 
        ON inventory_assets USING GIST (physical_station_range);
    """)
except Exception as e:
    print("Could not add physical_station_range column/index:", e)

conn.commit()
cur.close()
conn.close()

print("LOB tables and columns created successfully.")
