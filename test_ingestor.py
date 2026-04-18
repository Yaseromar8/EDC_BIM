import os
from ingestor_aps import main_ingestion

if __name__ == '__main__':
    # Usamos el URN activo reportado en pantallas anteriores
    urn = "urn:adsk.wipprod:fs.file:vf.Pw5I9d1sRGmIGDEMNOutA?version=1" 
    try:
        main_ingestion(urn)
        print("Success test!")
    except Exception as e:
        print("Error:", e)
