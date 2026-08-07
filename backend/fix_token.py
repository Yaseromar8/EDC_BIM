with open(r'd:\VISOR_APS_TL\backend\routes\civil_design_automation.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    
with open(r'd:\VISOR_APS_TL\backend\routes\civil_design_automation.py', 'w', encoding='utf-8') as f:
    for line in lines:
        if '        error_reason = "Unknown error"' in line:
            f.write('        token = get_internal_token()\n')
        f.write(line)
