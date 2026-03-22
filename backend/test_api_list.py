import os
import traceback
from dotenv import load_dotenv
load_dotenv()
import file_system_db

PROJECT_ID = "b.a7ce4d60-79f3-4dbf-b059-fefaf14f7b1d"
PATH = "proyectos/PQT8_TALARA/"

try:
    print(f"--- Probando RESOLUCIÓN de {PATH} ---")
    pid = file_system_db.resolve_path_to_node_id(PATH, PROJECT_ID)
    print(f"Parent Node ID: {pid}")

    if pid:
        print(f"--- Listando CONTENIDO de {pid} ---")
        # Dejar que falle si tiene que fallar para ver el traceback
        result = file_system_db.list_contents(pid, PROJECT_ID, PATH)
        print("ÉXITO!")
        print(f"Carpetas: {len(result['folders'])}")
        print(f"Archivos: {len(result['files'])}")
    else:
        print("ERROR: No se pudo resolver la ruta base.")
except Exception:
    traceback.print_exc()
