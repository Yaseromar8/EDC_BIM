with open(r'd:\VISOR_APS_TL\backend\routes\civil_design_automation.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    
with open(r'd:\VISOR_APS_TL\backend\routes\civil_design_automation.py', 'w', encoding='utf-8') as f:
    for line in lines:
        if '                                        if v_resp.ok:' in line:
            line = '                    if v_resp.ok:\n'
        if '400 400' in line:
            line = '            return jsonify({"error": f"Falta URN o input_url/output_url válidos. Detalle: {error_reason}"}), 400\n'
        f.write(line)
