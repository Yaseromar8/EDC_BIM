import os
import sys
from file_system_db import resolve_path_to_node_id

def initialize_project_folders(model_urn, project_name):
    """
    Crea la estructura de carpetas estándar para un proyecto técnico en el CDE.
    """
    clean_name = project_name.replace(' ', '_')
    base_path = f"proyectos/{clean_name}/05_SEGUIMIENTO/"
    
    folders = [
        "01_AVANCE",
        "02_FOTOS",
        "03_DOCUMENTOS",
        "04_RFI",
        "05_RESTRICCIONES"
    ]
    
    print(f"Initializing folders for project: {project_name} ({model_urn})")
    print(f"Base path: {base_path}")
    
    for folder in folders:
        full_path = f"{base_path}{folder}/"
        node_id = resolve_path_to_node_id(full_path, model_urn)
        print(f"  [OK] Created/Verified: {full_path} (ID: {node_id})")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python init_project_folders.py <model_urn> <project_name>")
        # Default mock for easy testing if needed
        # initialize_project_folders("global", "Proyecto_Demo")
    else:
        initialize_project_folders(sys.argv[1], sys.argv[2])
