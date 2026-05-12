"""Fix corrupted documents.py - clean approach"""
filepath = r'd:\VISOR_APS_TL\backend\routes\documents.py'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")

# Find the damaged area by looking for the marker
damage_start = None
damage_end = None
for i, line in enumerate(lines):
    if 'r.raise_for_status()' in line and i > 250:
        damage_start = i  # line 261 (0-indexed ~260)
    if "'/api/docs/versions/promote'" in line:
        damage_end = i  # The promote route starts here
        break

print(f"Damage start line: {damage_start+1 if damage_start else 'NOT FOUND'}")
print(f"Damage end line: {damage_end+1 if damage_end else 'NOT FOUND'}")

if damage_start is None or damage_end is None:
    print("Cannot find damage boundaries!")
    exit(1)

# Everything before the damage (keep through r.raise_for_status())
before = lines[:damage_start+1]

# Everything after (from promote route onward)
after = lines[damage_end:]

# The replacement block
nl = '\r\n' if lines[0].endswith('\r\n') else '\n'

replacement_lines = [
    '        ' + nl,
    '        def generate():' + nl,
    '            for chunk in r.iter_content(chunk_size=1024 * 512):' + nl,
    '                yield chunk' + nl,
    '                ' + nl,
    '        resp_headers = {}' + nl,
    "        for h in ['Content-Type', 'Content-Length', 'Accept-Ranges', 'Content-Range']:" + nl,
    '            if h in r.headers:' + nl,
    '                resp_headers[h] = r.headers[h]' + nl,
    '                ' + nl,
    "        resp_headers['Access-Control-Allow-Origin'] = '*'" + nl,
    "        resp_headers['Access-Control-Expose-Headers'] = 'Accept-Ranges, Content-Range, Content-Length'" + nl,
    '        ' + nl,
    '        return Response(generate(), status=r.status_code, headers=resp_headers)' + nl,
    '    except Exception as e:' + nl,
    '        print(f"[Proxy] Error streaming {gcs_urn}: {e}")' + nl,
    '        return "Error fetching document from storage", 502' + nl,
    nl,
    nl,
    "@documents_bp.route('/api/docs/list', methods=['GET'])" + nl,
    'def list_documents():' + nl,
    '    """Devuelve el inventario (archivos y carpetas logicas) desde PostgreSQL."""' + nl,
    "    node_id = request.args.get('id')" + nl,
    "    path = request.args.get('path', '')" + nl,
    "    model_urn = request.args.get('model_urn', 'global')" + nl,
    nl,
    '    from flask import g' + nl,
    "    user = getattr(g, 'current_user', None)" + nl,
    "    if request.remote_addr == '127.0.0.1' and not user:" + nl,
    "        user = {'id': 'local-admin', 'role': 'admin', 'name': 'Profiler'}" + nl,
    nl,
    '    if user and not verify_project_access(user, model_urn):' + nl,
    '        return jsonify({"success": False, "error": "No tienes acceso a este proyecto."}), 403' + nl,
    nl,
    '    try:' + nl,
    '        from file_system_db import resolve_path_to_node_id, list_contents, ensure_project_root_node' + nl,
    nl,
    '        import uuid as _uuid' + nl,
    '        def is_valid_uuid(val):' + nl,
    '            try:' + nl,
    '                _uuid.UUID(str(val))' + nl,
    '                return True' + nl,
    '            except ValueError:' + nl,
    '                return False' + nl,
    nl,
    "        if node_id and node_id != 'null' and is_valid_uuid(node_id):" + nl,
    '            parent_id = node_id' + nl,
    '        elif path:' + nl,
    "            if not path.endswith('/'): path += '/'" + nl,
    '            parent_id = resolve_path_to_node_id(path, model_urn, auto_create=False)' + nl,
    "            is_project_root = (path.strip('/') == model_urn.strip('/') or path.strip('/') == '')" + nl,
    "            if is_project_root and model_urn != 'global':" + nl,
    '                root_id = ensure_project_root_node(model_urn)' + nl,
    '                if root_id:' + nl,
    '                    parent_id = root_id' + nl,
    "            if not parent_id and not is_project_root and model_urn != 'global':" + nl,
    "                parent_id = resolve_path_to_node_id(path, 'global', auto_create=False)" + nl,
    '                if parent_id:' + nl,
    "                    model_urn = 'global'" + nl,
    '            if not parent_id and not is_project_root:' + nl,
    '                return jsonify({"success": True, "data": {"folders": [], "files": [], "current_node_id": None}}), 200' + nl,
    '        else:' + nl,
    '            parent_id = None' + nl,
    nl,
    '        contents = list_contents(parent_id, model_urn, path, user=user)' + nl,
    nl,
    "        for f in contents['files']:" + nl,
    "            if f.get('gcs_urn'):" + nl,
    "                f['mediaLink'] = generate_signed_url(f['gcs_urn'])" + nl,
    nl,
    '        return jsonify({"success": True, "data": {**contents, "current_node_id": str(parent_id) if parent_id else None}}), 200' + nl,
    '    except Exception as e:' + nl,
    '        import traceback' + nl,
    '        traceback.print_exc()' + nl,
    '        return jsonify({"success": False, "error": str(e)}), 500' + nl,
    nl,
    nl,
    "@documents_bp.route('/api/docs/versions', methods=['GET'])" + nl,
    'def get_versions():' + nl,
    '    """Obtiene el historial de versiones de un archivo."""' + nl,
    "    file_id = request.args.get('id')" + nl,
    "    model_urn = request.args.get('model_urn', 'global')" + nl,
    nl,
    '    if not file_id:' + nl,
    '        return jsonify({"success": False, "error": "ID de archivo no proporcionado"}), 400' + nl,
    nl,
    '    try:' + nl,
    '        from file_system_db import get_file_versions' + nl,
    '        versions = get_file_versions(model_urn, file_id)' + nl,
    '        return jsonify({"success": True, "versions": versions}), 200' + nl,
    '    except Exception as e:' + nl,
    '        return jsonify({"success": False, "error": str(e)}), 500' + nl,
    nl,
]

new_content = before + replacement_lines + after

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(new_content)

print(f"SUCCESS: Written {len(new_content)} lines (was {len(lines)})")
