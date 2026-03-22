import os
import re

# Refined patterns with regex to handle spaces and similar artifacts
# ðŸ“  usually maps to \xf0\x9f\x93\x81
# ðŸ‘¥ maps to \xf0\x9f\x91\xa5

def get_replacements(content):
    # Using regex for flexible matching of known broken strings
    
    # 1. Broken Folder Icon (ðŸ“ )
    content = re.sub(r'ðŸ“ \s*', '<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"2\"><path d=\"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z\"></path></svg> ', content)
    
    # 2. Broken Users Icon (ðŸ‘¥)
    content = re.sub(r'ðŸ‘¥\s*', '<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"2\"><path d=\"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2\"></path><circle cx=\"9\" cy=\"7\" r=\"4\"></circle><path d=\"M23 21v-2a4 4 0 0 0-3-3.87\"></path><path d=\"M16 3.13a4 4 0 0 1 0 7.75\"></path></svg> ', content)
    
    # 3. Broken Construction (ðŸ —ï¸ )
    content = content.replace('ðŸ —ï¸ ', '🏗️')
    
    # 4. Broken Em-dash (â€”)
    content = content.replace('â€”', '-')
    
    # 5. Broken Box-drawing (â”€)
    content = content.replace('â”€', '-')
    
    return content

def sanitize_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        original_content = content
        content = get_replacements(content)
        
        if content != original_content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f'Sanitized: {filepath}')
    except Exception as e:
        print(f'Error sanitizing {filepath}: {e}')

paths_to_search = [
    os.path.join('d:', os.sep, 'VISOR_APS_TL', 'frontend-docs', 'src'),
    os.path.join('d:', os.sep, 'VISOR_APS_TL', 'frontend-react', 'src')
]

for base_path in paths_to_search:
    if not os.path.exists(base_path):
        continue
    for root, dirs, files in os.walk(base_path):
        for file in files:
            if file.endswith(('.jsx', '.js', '.html', '.css', '.md')):
                sanitize_file(os.path.join(root, file))
