"""Setup de tests: pone backend/ en sys.path para importar los modulos de la app.
Los tests son DB-free (inyectan/mockean lo que tocaria la BD), corren en CI sin Postgres."""
import os
import sys

# backend/ (un nivel arriba de tests/) al sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
