"""
Rota la contrasena del usuario admin (reemplaza el viejo 'admin123').

Uso (cualquiera de las dos):
    set ADMIN_PASSWORD=TuPasswordFuerte   &&  python set_admin_password.py
    python set_admin_password.py "TuPasswordFuerte"

Opcional: ADMIN_EMAIL (default omarsanchezh8@gmail.com).
No imprime la password. Rechaza passwords debiles.
"""
import sys, os, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pathlib
from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).resolve().parent.parent / '.env')
load_dotenv()
from werkzeug.security import generate_password_hash
from db import init_db_pool, get_db_connection

EMAIL = os.getenv('ADMIN_EMAIL', 'omarsanchezh8@gmail.com')
pw = os.getenv('ADMIN_PASSWORD') or (sys.argv[1] if len(sys.argv) > 1 else None)

if not pw:
    print("ERROR: define ADMIN_PASSWORD (env) o pasala como argumento. Abortado.")
    sys.exit(1)
if pw == 'admin123' or len(pw) < 8:
    print("ERROR: password debil. Usa >= 8 caracteres y NO 'admin123'. Abortado.")
    sys.exit(1)

init_db_pool()
with get_db_connection() as conn:
    cur = conn.cursor()
    cur.execute("UPDATE users SET password_hash = %s WHERE email = %s",
                (generate_password_hash(pw), EMAIL))
    n = cur.rowcount
    conn.commit()

if n:
    print(f"OK: password actualizada para {EMAIL} ({n} fila).")
else:
    print(f"AVISO: no existe usuario {EMAIL}. Nada cambiado.")
