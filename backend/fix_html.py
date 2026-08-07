import codecs

path = r'D:\VISOR_APS_TL\frontend-react\public\4D LOB Progress - Standalone.html'
with codecs.open(path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

idx = content.find("Canal Jes")
if idx != -1:
    start_idx = content.rfind("<div style=\\\"display:flex;", 0, idx)
    end_idx = content.find("<\\u002Fdiv>", idx)
    
    if start_idx != -1 and end_idx != -1:
        end_idx += 11 
        
        replacement = r'''<div style=\"display:flex;align-items:center;background:#1a1c21;border:1px solid #2a2e35;border-radius:7px;padding:3px;gap:2px;font-size:12px;font-weight:600;flex-wrap:wrap;\">
            <span style=\"padding:5px 12px;border-radius:5px;background:#3a3d44;color:#fff;cursor:pointer;\">01. OP<\u002Fspan>
            <span style=\"padding:5px 12px;border-radius:5px;color:#8a919c;cursor:pointer;\">02. C-YALE3<\u002Fspan>
            <span style=\"padding:5px 12px;border-radius:5px;color:#8a919c;cursor:pointer;\">03. ACOPIO-YALE3<\u002Fspan>
            <span style=\"padding:5px 12px;border-radius:5px;color:#8a919c;cursor:pointer;\">04. ACCESOS-CANAL<\u002Fspan>
            <span style=\"padding:5px 12px;border-radius:5px;color:#8a919c;cursor:pointer;\">05. CANAL<\u002Fspan>
            <span style=\"padding:5px 12px;border-radius:5px;color:#8a919c;cursor:pointer;\">06. DU<\u002Fspan>
            <span style=\"padding:5px 12px;border-radius:5px;color:#8a919c;cursor:pointer;\">07. P-AMBIENTAL<\u002Fspan>
          <\u002Fdiv>'''
          
        new_content = content[:start_idx] + replacement + content[end_idx:]
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("Successfully replaced using start_idx and end_idx.")
    else:
        print("Could not find start or end div.")
else:
    print("Could not find Canal Jes.")
