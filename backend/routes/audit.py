"""
RELINK AUDIT MODULE
Captura snapshots del estado completo de la metadata para comparar antes/después de un relink.
"""
import json
import traceback
from flask import Blueprint, request, jsonify
from db import get_db_connection

audit_bp = Blueprint('audit', __name__)


def capture_snapshot(project_id):
    """Captura un snapshot completo de toda la metadata asociada a un proyecto."""
    snapshot = {
        "project_id": project_id,
        "models": [],
        "tracking_pins": {"totals": {}, "pins": []},
        "tracking_progress": [],
        "tracking_details": [],
        "photo_evidences": [],
        "file_system_nodes": 0,
        "rosetta_entries": 0,
    }

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # 1. MODEL CONFIG
            cursor.execute("""
                SELECT model_id, name, urn, source, version_id, version_number,
                       last_modified_time, app_project_id, default_view_guid
                FROM model_config
                WHERE app_project_id = %s
                ORDER BY added_at
            """, (project_id,))
            for row in cursor.fetchall():
                snapshot["models"].append({
                    "model_id": row[0],
                    "name": row[1],
                    "urn": row[2][:20] + "..." if row[2] else None,   # Truncado por seguridad
                    "urn_full": row[2],
                    "source": row[3],
                    "version_id": row[4],
                    "version_number": row[5],
                    "last_modified": row[6],
                    "app_project_id": row[7],
                    "default_view_guid": row[8],
                })

            # 2. TRACKING PINS (3D markers)
            cursor.execute("""
                SELECT id, pin_type, x, y, z, val, color, data, specialty
                FROM tracking_pins
                WHERE model_urn = %s
                ORDER BY created_at
            """, (project_id,))
            pins_by_type = {}
            for row in cursor.fetchall():
                pin_type = row[1]
                pins_by_type[pin_type] = pins_by_type.get(pin_type, 0) + 1
                extra_data = row[7] if isinstance(row[7], dict) else {}
                snapshot["tracking_pins"]["pins"].append({
                    "id": row[0],
                    "type": pin_type,
                    "x": round(row[2], 4) if row[2] else None,
                    "y": round(row[3], 4) if row[3] else None,
                    "z": round(row[4], 4) if row[4] else None,
                    "val": row[5],
                    "color": row[6],
                    "specialty": row[8],
                    "has_docs": len(extra_data.get("docs", [])) if isinstance(extra_data, dict) else 0,
                    "has_photos": len(extra_data.get("photos", [])) if isinstance(extra_data, dict) else 0,
                    "codigo_partida": extra_data.get("codigoPartida") if isinstance(extra_data, dict) else None,
                })
            snapshot["tracking_pins"]["totals"] = pins_by_type

            # 3. TRACKING PROGRESS (Excel data)
            cursor.execute("""
                SELECT COUNT(*) FROM tracking_progress WHERE model_urn = %s
            """, (project_id,))
            count = cursor.fetchone()[0]
            snapshot["tracking_progress"] = {"total_rows": count}
            
            if count > 0:
                cursor.execute("""
                    SELECT id, partida, codigo_partida, porcentaje_avance, specialty
                    FROM tracking_progress
                    WHERE model_urn = %s
                    LIMIT 5
                """, (project_id,))
                snapshot["tracking_progress"]["sample"] = [
                    {"id": r[0], "partida": r[1], "codigo": r[2], "avance": r[3], "specialty": r[4]}
                    for r in cursor.fetchall()
                ]

            # 4. TRACKING DETAILS
            cursor.execute("""
                SELECT COUNT(*) FROM tracking_details WHERE model_urn = %s
            """, (project_id,))
            snapshot["tracking_details"] = {"total_rows": cursor.fetchone()[0]}

            # 5. PHOTO EVIDENCES
            cursor.execute("""
                SELECT COUNT(*) FROM photo_evidences WHERE model_urn = %s
            """, (project_id,))
            snapshot["photo_evidences"] = {"total_rows": cursor.fetchone()[0]}

            # 6. FILE SYSTEM NODES (ECD)
            try:
                cursor.execute("""
                    SELECT COUNT(*) FROM file_system_nodes WHERE model_urn = %s AND is_deleted = FALSE
                """, (project_id,))
                snapshot["file_system_nodes"] = cursor.fetchone()[0]
            except Exception:
                snapshot["file_system_nodes"] = "table_not_found"

            # 7. ROSETTA (Property extraction cache)
            try:
                cursor.execute("""
                    SELECT COUNT(*) FROM rosetta_stone WHERE model_urn = %s
                """, (project_id,))
                snapshot["rosetta_entries"] = cursor.fetchone()[0]
            except Exception:
                snapshot["rosetta_entries"] = "table_not_found"

    except Exception as e:
        snapshot["error"] = str(e)
        traceback.print_exc()

    return snapshot


def compare_snapshots(before, after):
    """Compara dos snapshots y genera un reporte de diferencias."""
    report = {
        "status": "OK",
        "warnings": [],
        "changes": [],
        "pin_analysis": {
            "total_before": len(before.get("tracking_pins", {}).get("pins", [])),
            "total_after": len(after.get("tracking_pins", {}).get("pins", [])),
            "lost_pins": [],
            "moved_pins": [],
            "unchanged_pins": 0,
        }
    }

    # 1. Model changes
    before_models = {m["model_id"]: m for m in before.get("models", [])}
    after_models = {m["model_id"]: m for m in after.get("models", [])}

    for mid, bm in before_models.items():
        am = after_models.get(mid)
        if not am:
            report["changes"].append(f"⚠️ Modelo '{bm['name']}' eliminado (ID: {mid})")
            report["warnings"].append("MODEL_DELETED")
        elif bm["urn_full"] != am["urn_full"]:
            report["changes"].append(
                f"🔄 Modelo '{bm['name']}' relinked: v{bm.get('version_number')} → v{am.get('version_number')}"
            )
            report["changes"].append(f"   URN viejo: {bm['urn']}")
            report["changes"].append(f"   URN nuevo: {am['urn']}")

    # 2. Pin analysis
    before_pins = {p["id"]: p for p in before.get("tracking_pins", {}).get("pins", [])}
    after_pins = {p["id"]: p for p in after.get("tracking_pins", {}).get("pins", [])}

    for pid, bp in before_pins.items():
        ap = after_pins.get(pid)
        if not ap:
            report["pin_analysis"]["lost_pins"].append({
                "id": pid, "type": bp["type"], "val": bp["val"],
                "coords": f"({bp['x']}, {bp['y']}, {bp['z']})"
            })
            report["status"] = "WARNING"
        else:
            # Check if position changed
            if bp["x"] != ap["x"] or bp["y"] != ap["y"] or bp["z"] != ap["z"]:
                dx = abs((ap["x"] or 0) - (bp["x"] or 0))
                dy = abs((ap["y"] or 0) - (bp["y"] or 0))
                dz = abs((ap["z"] or 0) - (bp["z"] or 0))
                report["pin_analysis"]["moved_pins"].append({
                    "id": pid, "type": bp["type"],
                    "delta": f"Δx={dx:.4f}, Δy={dy:.4f}, Δz={dz:.4f}"
                })
                report["status"] = "WARNING"
            else:
                report["pin_analysis"]["unchanged_pins"] += 1

    # 3. Data integrity
    for key in ["tracking_progress", "tracking_details", "photo_evidences"]:
        b_count = before.get(key, {}).get("total_rows", 0) if isinstance(before.get(key), dict) else 0
        a_count = after.get(key, {}).get("total_rows", 0) if isinstance(after.get(key), dict) else 0
        if b_count != a_count:
            report["changes"].append(f"📊 {key}: {b_count} → {a_count} registros")
        else:
            report["changes"].append(f"✅ {key}: {a_count} registros (sin cambios)")

    b_files = before.get("file_system_nodes", 0)
    a_files = after.get("file_system_nodes", 0)
    if b_files != a_files:
        report["changes"].append(f"📁 file_system_nodes: {b_files} → {a_files}")
    else:
        report["changes"].append(f"✅ file_system_nodes: {a_files} (sin cambios)")

    b_rosetta = before.get("rosetta_entries", 0)
    a_rosetta = after.get("rosetta_entries", 0)
    if b_rosetta != a_rosetta:
        report["changes"].append(f"🔬 rosetta_stone: {b_rosetta} → {a_rosetta}")
    else:
        report["changes"].append(f"✅ rosetta_stone: {a_rosetta} (sin cambios)")

    if not report["pin_analysis"]["lost_pins"] and not report["pin_analysis"]["moved_pins"]:
        report["pin_analysis"]["verdict"] = "✅ TODOS LOS PINES INTACTOS"
    elif report["pin_analysis"]["lost_pins"]:
        report["pin_analysis"]["verdict"] = f"❌ {len(report['pin_analysis']['lost_pins'])} PINES PERDIDOS"
        report["status"] = "CRITICAL"
    else:
        report["pin_analysis"]["verdict"] = f"⚠️ {len(report['pin_analysis']['moved_pins'])} PINES DESPLAZADOS"

    return report


# In-memory storage for the "before" snapshot
_snapshots = {}


def _solo_admin():
    """Guardia efectiva dentro de la vista.

    Estas dos rutas estaban declaradas como rol:admin, pero la politica corre en
    MODO SOMBRA -- registra y no bloquea -- asi que la declaracion no impedia
    nada. Comprobado con una sesion de rol 'user': /api/audit/snapshot devolvia
    200 con la instantanea completa de una obra ajena. Un guard no puede dar por
    hecho que otra capa ya comprobo.
    """
    from flask import g
    u = getattr(g, 'current_user', None)
    if not u:
        return jsonify({'error': 'Autenticación requerida', 'code': 'NO_TOKEN'}), 401
    if u.get('role') != 'admin':
        return jsonify({'error': 'Solo los administradores pueden usar la auditoría.'}), 403
    return None


@audit_bp.route('/api/audit/snapshot', methods=['GET'])
def take_snapshot():
    """Captura un snapshot del estado actual. Usar antes del relink."""
    negativa = _solo_admin()
    if negativa:
        return negativa
    project_id = request.args.get('project')
    if not project_id:
        return jsonify({"error": "Falta parámetro 'project'"}), 400

    snapshot = capture_snapshot(project_id)
    
    # Store as "before"
    _snapshots[project_id] = snapshot
    
    pin_count = len(snapshot["tracking_pins"]["pins"])
    model_count = len(snapshot["models"])
    
    print(f"\n{'='*60}")
    print(f"  📸 SNAPSHOT CAPTURADO - Proyecto: {project_id}")
    print(f"  Modelos: {model_count}")
    print(f"  Pines de tracking: {pin_count}")
    print(f"  Pines por tipo: {snapshot['tracking_pins']['totals']}")
    print(f"{'='*60}\n")

    return jsonify({
        "status": "snapshot_saved",
        "summary": {
            "project_id": project_id,
            "models": model_count,
            "tracking_pins": pin_count,
            "pins_by_type": snapshot["tracking_pins"]["totals"],
            "tracking_progress_rows": snapshot["tracking_progress"].get("total_rows", 0) if isinstance(snapshot["tracking_progress"], dict) else 0,
            "photo_evidences": snapshot["photo_evidences"].get("total_rows", 0) if isinstance(snapshot["photo_evidences"], dict) else 0,
            "file_system_nodes": snapshot["file_system_nodes"],
            "rosetta_entries": snapshot["rosetta_entries"],
        },
        "snapshot": snapshot
    })


@audit_bp.route('/api/audit/compare', methods=['GET'])
def compare_after_relink():
    """Compara el estado actual vs el snapshot guardado. Usar después del relink."""
    negativa = _solo_admin()
    if negativa:
        return negativa
    project_id = request.args.get('project')
    if not project_id:
        return jsonify({"error": "Falta parámetro 'project'"}), 400

    before = _snapshots.get(project_id)
    if not before:
        return jsonify({"error": f"No hay snapshot previo para '{project_id}'. Ejecuta /api/audit/snapshot primero."}), 404

    after = capture_snapshot(project_id)
    report = compare_snapshots(before, after)

    print(f"\n{'='*60}")
    print(f"  🔍 COMPARACIÓN POST-RELINK - Proyecto: {project_id}")
    print(f"  Status: {report['status']}")
    print(f"  Pines: {report['pin_analysis']['total_before']} → {report['pin_analysis']['total_after']}")
    print(f"  Veredicto: {report['pin_analysis']['verdict']}")
    for change in report["changes"]:
        print(f"  {change}")
    print(f"{'='*60}\n")

    return jsonify({
        "report": report,
        "before_summary": {
            "models": len(before.get("models", [])),
            "pins": before["tracking_pins"]["totals"],
        },
        "after_summary": {
            "models": len(after.get("models", [])),
            "pins": after["tracking_pins"]["totals"],
        },
        "after_snapshot": after
    })
