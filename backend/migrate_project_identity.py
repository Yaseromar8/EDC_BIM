"""
Pilar Identidad - Backfill de project_id (la obra canonica) en todas las tablas.

Mapea cada 'frente' (model_urn/app_project_id, ej. '1_CANAL') a su obra en projects:
  1. prefijo antes del primer '_'  -> si es un projects.id  (ej. '1_CANAL' -> '1')
  2. 'proyectos/NOMBRE' o NOMBRE    -> match con projects.name
  3. match exacto con projects.model_urn o projects.id
  4. si hay UNA sola obra activa     -> default (cubre 'global')

Garantias: SOLO escribe la columna project_id (ya creada por ensure_project_identity_columns).
No toca el 'frente' ni ningun otro dato. Idempotente (re-ejecutable).

Uso: cd backend && python migrate_project_identity.py
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pathlib
from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).resolve().parent.parent / '.env')
load_dotenv()
from db import init_db_pool, get_db_connection, ensure_project_identity_columns, PROJECT_SCOPED_TABLES

# Columna de 'frente' por tabla
FRENTE_COL = {t: ('app_project_id' if t == 'model_config' else 'model_urn') for t in PROJECT_SCOPED_TABLES}


def build_resolver(cur):
    cur.execute("SELECT id, name, model_urn, status FROM projects")
    by_id, by_name, by_urn = {}, {}, {}
    active = []
    for pid, name, murn, status in cur.fetchall():
        by_id[pid] = pid
        if name:
            by_name[name] = pid
        if murn:
            by_urn[murn] = pid
        if status == 'active':
            active.append(pid)
    default = active[0] if len(active) == 1 else None
    print(f"[Identidad] Obras: {len(by_id)} | activa unica (default): {default}")

    def resolve(frente):
        if not frente or frente == 'global':
            return default
        prefix = frente.split('_', 1)[0]
        if prefix in by_id:
            return prefix
        tail = frente.split('/')[-1]
        if tail in by_name:
            return by_name[tail]
        if frente in by_name:
            return by_name[frente]
        if frente in by_urn:
            return by_urn[frente]
        if frente in by_id:
            return frente
        return default
    return resolve


def migrate():
    init_db_pool()
    ensure_project_identity_columns()
    with get_db_connection() as conn:
        cur = conn.cursor()
        resolve = build_resolver(cur)

        for t in PROJECT_SCOPED_TABLES:
            fcol = FRENTE_COL[t]
            try:
                cur.execute(f"SELECT DISTINCT {fcol} FROM {t} WHERE {fcol} IS NOT NULL")
                frentes = [r[0] for r in cur.fetchall()]
            except Exception as e:
                conn.rollback()
                print(f"  - {t}: (saltado: {e})")
                continue

            updated = 0
            for f in frentes:
                pid = resolve(f)
                if pid:
                    cur.execute(
                        f"UPDATE {t} SET project_id = %s WHERE {fcol} = %s AND project_id IS DISTINCT FROM %s",
                        (pid, f, pid)
                    )
                    updated += cur.rowcount
            conn.commit()

            # Cobertura
            cur.execute(f"SELECT COUNT(*), COUNT(project_id) FROM {t}")
            total, withpid = cur.fetchone()
            mapping = {f: resolve(f) for f in frentes}
            print(f"  - {t:22s}: {withpid}/{total} con project_id  (+{updated})  {mapping if frentes else ''}")

        print("\n[Identidad] Backfill OK. project_id poblado; 'frente' y datos intactos.")


if __name__ == '__main__':
    migrate()
