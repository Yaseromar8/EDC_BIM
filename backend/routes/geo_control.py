# Puntos de CONTROL TOPOGRÁFICO del proyecto + amarre modelo↔UTM (georef).
#
# Son la columna vertebral del AR georreferenciado: la red de puntos que el
# topógrafo ya usa para el dron (ID, Este, Norte, Cota) entra por la web UNA
# vez, y el campo la consume para calibrar el AR midiendo 2+ puntos (estación
# libre con la tablet). El amarre modelo↔UTM se resuelve en el visor con
# pares de correspondencia (clic en el modelo ↔ coordenada UTM) y se guarda
# como transformación Helmert 2D + cota, con su residual: los datos del
# proyecto viven en la plataforma, jamás incrustados en un APK.
import json
from flask import Blueprint, request, jsonify
from db import get_db_connection

geo_control_bp = Blueprint('geo_control', __name__)


def ensure_geo_tables():
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS geo_control_points (
                    id SERIAL PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    punto_id TEXT NOT NULL,
                    este DOUBLE PRECISION NOT NULL,
                    norte DOUBLE PRECISION NOT NULL,
                    cota DOUBLE PRECISION,
                    descripcion TEXT,
                    activo BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (project_id, punto_id)
                )
            ''')
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS geo_model_georef (
                    id SERIAL PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    urn TEXT NOT NULL,
                    crs TEXT,
                    pares JSONB,
                    transform JSONB,
                    residual_m DOUBLE PRECISION,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (project_id, urn)
                )
            ''')
            conn.commit()
            print("[geo] Tablas geo_control_points / geo_model_georef verificadas.")
    except Exception as e:
        print(f"[geo] Error en ensure_geo_tables: {e}")


try:
    ensure_geo_tables()
except Exception:
    pass


@geo_control_bp.route('/api/geo/control-points', methods=['GET'])
def listar_puntos():
    project_id = request.args.get('project')
    if not project_id:
        return jsonify({"error": "project es obligatorio"}), 400
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT punto_id, este, norte, cota, descripcion, activo
                FROM geo_control_points
                WHERE project_id = %s AND activo
                ORDER BY punto_id
            """, (project_id,))
            puntos = [{
                "punto_id": r[0], "este": r[1], "norte": r[2],
                "cota": r[3], "descripcion": r[4] or "",
            } for r in cursor.fetchall()]
        return jsonify({"puntos": puntos})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@geo_control_bp.route('/api/geo/control-points', methods=['POST'])
def cargar_puntos():
    """Carga masiva desde el CSV del topógrafo (el mismo del dron).
    Body: { project, replace: bool, puntos: [{punto_id, este, norte, cota, descripcion}] }
    Upsert por (project, punto_id): recargar el CSV corregido nunca duplica."""
    data = request.get_json(silent=True) or {}
    project_id = data.get('project')
    puntos = data.get('puntos') or []
    if not project_id or not puntos:
        return jsonify({"error": "project y puntos son obligatorios"}), 400
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if data.get('replace'):
                cursor.execute("DELETE FROM geo_control_points WHERE project_id = %s", (project_id,))
            n = 0
            for p in puntos:
                pid = str(p.get('punto_id') or '').strip()
                if not pid:
                    continue
                cursor.execute("""
                    INSERT INTO geo_control_points (project_id, punto_id, este, norte, cota, descripcion, activo)
                    VALUES (%s, %s, %s, %s, %s, %s, TRUE)
                    ON CONFLICT (project_id, punto_id) DO UPDATE SET
                        este = EXCLUDED.este, norte = EXCLUDED.norte,
                        cota = EXCLUDED.cota, descripcion = EXCLUDED.descripcion,
                        activo = TRUE
                """, (project_id, pid, float(p['este']), float(p['norte']),
                      float(p['cota']) if p.get('cota') is not None else None,
                      p.get('descripcion') or ''))
                n += 1
            conn.commit()
        return jsonify({"ok": True, "cargados": n})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@geo_control_bp.route('/api/geo/control-points/<punto_id>', methods=['DELETE'])
def borrar_punto(punto_id):
    project_id = request.args.get('project')
    if not project_id:
        return jsonify({"error": "project es obligatorio"}), 400
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE geo_control_points SET activo = FALSE
                WHERE project_id = %s AND punto_id = %s
            """, (project_id, punto_id))
            conn.commit()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@geo_control_bp.route('/api/geo/georef', methods=['GET'])
def leer_georef():
    project_id = request.args.get('project')
    urn = request.args.get('urn')
    if not project_id or not urn:
        return jsonify({"error": "project y urn son obligatorios"}), 400
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT crs, pares, transform, residual_m, updated_at
                FROM geo_model_georef WHERE project_id = %s AND urn = %s
            """, (project_id, urn))
            r = cursor.fetchone()
        if not r:
            return jsonify({"georef": None})
        return jsonify({"georef": {
            "crs": r[0], "pares": r[1], "transform": r[2],
            "residual_m": r[3], "updated_at": r[4].isoformat() if r[4] else None,
        }})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@geo_control_bp.route('/api/geo/georef', methods=['POST'])
def guardar_georef():
    """Guarda el amarre modelo↔UTM de un modelo (urn) del proyecto.
    Body: { project, urn, crs, pares: [{modelo:[x,y,z], utm:[E,N,Z], punto_id}],
            transform: {escala, yawDeg, tx, ty, tz}, residual_m }
    La transformación la calcula el frontend (georefFit, con tests) y aquí se
    persiste junto a los pares crudos: si mañana mejora el ajuste, se recalcula
    de los pares sin volver a clicar nada."""
    data = request.get_json(silent=True) or {}
    project_id = data.get('project')
    urn = data.get('urn')
    if not project_id or not urn:
        return jsonify({"error": "project y urn son obligatorios"}), 400
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO geo_model_georef (project_id, urn, crs, pares, transform, residual_m, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (project_id, urn) DO UPDATE SET
                    crs = EXCLUDED.crs, pares = EXCLUDED.pares,
                    transform = EXCLUDED.transform, residual_m = EXCLUDED.residual_m,
                    updated_at = CURRENT_TIMESTAMP
            """, (project_id, urn, data.get('crs') or '',
                  json.dumps(data.get('pares') or []),
                  json.dumps(data.get('transform') or {}),
                  data.get('residual_m')))
            conn.commit()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
