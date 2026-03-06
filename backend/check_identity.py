import os
from google.cloud import resourcemanager_v3
from google.auth import default
from dotenv import load_dotenv

load_dotenv('../.env')

def diagnostic():
    try:
        creds, actual_project_id = default()
        print(f"--- DIAGNÓSTICO DE PROYECTO ---")
        print(f"ID detectado por defecto: {actual_project_id}")
        print(f"ID en .env: {os.environ.get('GCP_PROJECT_ID')}")
        
        # Intentar obtener el nombre del proyecto
        try:
            client = resourcemanager_v3.ProjectsClient()
            project_info = client.get_project(name=f"projects/{actual_project_id}")
            print(f"Nombre del proyecto en Google: {project_info.display_name}")
        except Exception as e:
            print(f"No se pudo obtener el nombre detallado: {e}")

        # Probar conexión a Vertex con el ID detectado
        import vertexai
        from vertexai.generative_models import GenerativeModel
        
        locations = ["us-central1", "us-east4"]
        for loc in locations:
            print(f"\nProbando en {loc} con ID {actual_project_id}...")
            try:
                vertexai.init(project=actual_project_id, location=loc)
                model = GenerativeModel("gemini-1.5-flash")
                # Solo intentamos inicializar el objeto, no generar
                print(f"✅ Objeto GenerativeModel creado con éxito en {loc}")
            except Exception as e:
                print(f"❌ Falló en {loc}: {e}")

    except Exception as e:
        print(f"❌ Error fatal en diagnóstico: {e}")

if __name__ == "__main__":
    diagnostic()
