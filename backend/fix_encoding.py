import os
import re

file_path = 'd:/VISOR_APS_TL/frontend-docs/src/App.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Mapa de reemplazos comunes doble-utf8 a español
replacements = {
    'DescripciÃ³n': 'Descripción',
    'descripciÃ³n': 'descripción',
    'descripciÃ³': 'descripció',
    'VersiÃ³n': 'Versión',
    'versiÃ³n': 'versión',
    'AÃ±adir': 'Añadir',
    'aÃ±adir': 'añadir',
    'ConfiguraciÃ³n': 'Configuración',
    'configuraciÃ³n': 'configuración',
    'transmisiÃ³n': 'transmisión',
    'TransmisiÃ³n': 'Transmisión',
    'Opciones de visualizaciÃ³n': 'Opciones de visualización',
    'CreaciÃ³n': 'Creación',
    'MÃ¡s': 'Más',
    'mÃ¡s': 'más',
    'AtrÃ¡s': 'Atrás',
    'atrÃ¡s': 'atrás',
    'vacÃ\xada': 'vacía',
    'AquÃ\xad': 'Aquí',
    'Ã¡': 'á',
    'Ã©': 'é',
    'Ã\xad': 'í',
    'Ã³': 'ó',
    'Ãº': 'ú',
    'Ã±': 'ñ',
    'Ã\x81': 'Á',
    'Ã\x89': 'É',
    'Ã\x8d': 'Í',
    'Ã\x93': 'Ó',
    'Ã\x9a': 'Ú',
    'Ã\x91': 'Ñ'
}

for bad, good in replacements.items():
    content = content.replace(bad, good)

# También arreglar vacÃ­a que se muestra en el screenshot
content = content.replace('vacÃ­a', 'vacía')
content = content.replace('descripciÃ³', 'descripció') # catch all

with open(file_path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)

print("Caracteres corruptos reemplazados.")
