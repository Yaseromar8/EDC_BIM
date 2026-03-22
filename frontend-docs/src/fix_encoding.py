import os

path = r"d:\VISOR_APS_TL\frontend-docs\src\App.jsx"

# Common broken sequences in App.jsx
# Note: These are likely UTF-8 bytes interpreted as windows-1252 or similar
replacements = {
    'Ã°Å¸â€œâ€¢': '📘',
    'Ã°Å¸â€œËœ': '📗',
    'Ã°Å¸â€œâ€”': '📊',
    'Ã°Å¸â€œÅ\xa0': '🔢',
    'Ã°Å¸â€“Â¼Ã¯Â¸Â': '🖼️',
    'Ã°Å¸Å½Â¨': '🎨',
    'Ã°Å¸â€œâ„¢': '📒',
    'Ã°Å¸â€œâ€ž': '📄',
    'Ã°Å¸â€œÂ': '📐',
    'Ã°Å¸Â\xa0â€”Ã¯Â¸Â': '🏗️',
    'Ã°Å¸â€œÂ¦': '📦',
    'Ã°Å¸Å½Â¬': '🎬',
    'Ã°Å¸Å½Âµ': '🎵',
    'Ã¢â€\xa0â\x80\x98': '↓',
    'Â¿': '¿',
    'QuÃ©': 'Qué',
    'DescripciÃ³n': 'Descripción',
    'VersiÃ³n': 'Versión',
    'TamaÃ±o': 'Tamaño',
    'AÃ±adir': 'Añadir',
    'InvitaciÃ³n': 'Invitación',
    'RevisiÃ³n': 'Revisión',
    'Últ. actualizaciÃ³n': 'Últ. actualización',
    'Ã¡': 'á',
    'Ã©': 'é',
    'Ã\xad': 'í',
    'Ã³': 'ó',
    'Ãº': 'ú',
    'Ã±': 'ñ',
    'Ã\x8a': 'ê',
}

try:
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    for old, new in replacements.items():
        if old in content:
            content = content.replace(old, new)

    # Specific fix for the BIM Cloud logo sequence if still broken
    content = content.replace('â\x98\x81ï¸\x8f', '☁️')
    content = content.replace('ðŸ\x97\x91ï¸\x8f', '🗑️')

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("RESTORATION COMPLETE")
except Exception as e:
    print(f"ERROR: {e}")
