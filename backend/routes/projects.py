"""
Sistema de Proyectos Multi-Tenant al estilo Autodesk ACC.

ACC Equivalent:
  Hub       = Municipality (Municipalidad / Client Account)
  Project   = Specific construction project inside a Hub

Endpoints:
  GET  /api/hubs                          -> List all municipalities
  POST /api/hubs                          -> Create a new municipality
  GET  /api/hubs/:hub_id/projects         -> List projects for a hub
  POST /api/hubs/:hub_id/projects         -> Create new project in hub
  GET  /api/projects                      -> ALL projects (Landing Page)
  GET  /api/projects/:project_id          -> Get project details
  PUT  /api/projects/:project_id          -> Update project metadata
"""
from esquema_congelado import solo_con_ddl
import os
import json
import re
import time
from flask import Blueprint, request, jsonify, g
from rate_limit import limite
from politica import requiere_rol
from db import get_db_connection

projects_bp = Blueprint('projects', __name__)


def _auditar(evento, project_id, detalle=None):
    """Deja rastro de QUIEN cambio QUE obra.

    El 2026-08-07 alguien con sesion creo una obra y, cinco segundos despues,
    renombro y archivo PQT8_TALARA. No se pudo saber quien: la auditoria solo
    registraba entradas y salidas, no cambios sobre obras. Eso era el punto
    ciego, y esto lo cierra. Nunca revienta la peticion por fallar.
    """
    try:
        from routes.auth import registrar_evento
        user = getattr(g, 'current_user', None)
        registrar_evento(
            evento,
            email=(user or {}).get('email'),
            user_id=(user or {}).get('id'),
            detalle=f"obra={project_id}" + (f" · {detalle}" if detalle else ''),
        )
    except Exception as e:
        print(f"[projects] no se pudo auditar {evento}: {e}")


def _solo_admin(accion):
    """Guard EFECTIVO de administrador.

    El decorador @requiere_rol('admin') solo bloquea cuando AUTH_POLICY_MODE es
    'estricto'; mientras la politica corre en sombra es puramente declarativo.
    Estas rutas crean, renombran, repuntan y archivan obras, asi que no pueden
    esperar a la activacion: el guard va tambien dentro de la vista.
    """
    user = getattr(g, 'current_user', None)
    if not user:
        return jsonify({'error': 'Autenticación requerida', 'code': 'NO_TOKEN'}), 401
    if user.get('role') != 'admin':
        return jsonify({'error': f'Solo los administradores pueden {accion}.'}), 403
    return None

@solo_con_ddl
def ensure_projects_schema():
    """
    Crea las tablas de Hubs y Projects si no existen.
    Idempotente: no rompe si ya existen.
    Migra la tabla 'projects' antigua a la nueva si es necesario.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # --- HUBS TABLE (Municipalidades / Accounts) ---
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS hubs (
                    id TEXT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    region VARCHAR(100),
                    logo_url TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    is_active BOOLEAN DEFAULT TRUE
                );
            """)

            # --- Agregar columnas nuevas a projects si la tabla ya existia ---
            # Primero recrear con nueva estructura si necesita hub_id
            cursor.execute("""
                ALTER TABLE projects ADD COLUMN IF NOT EXISTS hub_id TEXT REFERENCES hubs(id) ON DELETE CASCADE;
            """)
            cursor.execute("""
                ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
            """)
            cursor.execute("""
                ALTER TABLE projects ADD COLUMN IF NOT EXISTS model_urn TEXT;
            """)
            cursor.execute("""
                ALTER TABLE projects ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
            """)
            cursor.execute("""
                ALTER TABLE projects ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
            """)
            cursor.execute("""
                ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type VARCHAR(100);
            """)
            cursor.execute("""
                ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE;
            """)
            cursor.execute("""
                ALTER TABLE projects ADD COLUMN IF NOT EXISTS end_date DATE;
            """)
            cursor.execute("""
                ALTER TABLE projects ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
            """)
            cursor.execute("""
                ALTER TABLE projects ADD COLUMN IF NOT EXISTS invite_code VARCHAR(10) UNIQUE;
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_projects_model_urn
                ON projects(model_urn);
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_projects_name
                ON projects(name);
            """)

            # --- Insertar Hub y Project por defecto para projects legacy ---
            # Verificar si hay proyectos sin hub asignado
            cursor.execute("SELECT COUNT(*) FROM projects WHERE hub_id IS NULL")
            orphan_count = cursor.fetchone()[0]

            if orphan_count > 0:
                # Crear Hub "default" para proyectos legacy
                default_hub_id = 'b.mdc_default_legacy'
                cursor.execute("""
                    INSERT INTO hubs (id, name, region) VALUES (%s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                """, (default_hub_id, 'Proyectos Generales', 'General'))

                # Asignar todos los proyectos legacy al hub default
                cursor.execute("""
                    UPDATE projects SET hub_id = %s WHERE hub_id IS NULL
                """, (default_hub_id,))

            # --- AUTO-RELLENAR model_urn para proyectos que no lo tengan ---
            # Fuente de verdad: projects.model_urn conecta con file_nodes.model_urn
            cursor.execute("""
                UPDATE projects SET model_urn = id WHERE model_urn IS NULL
            """)

            # --- AUTO-RELLENAR invite_code ---
            cursor.execute("SELECT id FROM projects WHERE invite_code IS NULL")
            null_projects = cursor.fetchall()
            for row in null_projects:
                p_id = row[0]
                code = _codigo_de_invitacion()
                try:
                    # En caso exótico de colisión el try/except salva el loop
                    cursor.execute("UPDATE projects SET invite_code = %s WHERE id = %s", (code, p_id))
                except Exception as e:
                    print(f"[projects] Colisión generando codigo para {p_id}: {e}")

            conn.commit()
            print("[projects] Schema Hub+Projects ACC-style verificado/migrado.")
    except Exception as e:
        print(f"[projects] Error en ensure_projects_schema: {e}")


# Init on import
try:
    ensure_projects_schema()
except Exception:
    pass


# ─── HUBS (Municipalidades / Accounts) ───────────────────────────────────────

@projects_bp.route('/api/hubs', methods=['GET'])
def list_hubs():
    """Lista todas las municipalidades/cuentas activas con cuenta de proyectos."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT h.id, h.name, h.region, h.logo_url, h.created_at,
                       COUNT(p.id) AS project_count
                FROM hubs h
                LEFT JOIN projects p ON p.hub_id = h.id AND p.status != 'archived'
                WHERE h.is_active = TRUE
                GROUP BY h.id
                ORDER BY h.name
            """)
            rows = cursor.fetchall()
            hubs = [{
                "id": r[0], "name": r[1], "region": r[2],
                "logo_url": r[3],
                "created_at": r[4].isoformat() if r[4] else None,
                "project_count": r[5]
            } for r in rows]
        return jsonify({"hubs": hubs}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@projects_bp.route('/api/hubs', methods=['POST'])
@requiere_rol('admin')
def create_hub():
    """Crear una nueva municipalidad/cuenta (Hub)."""
    denegado = _solo_admin('crear portafolios')
    if denegado:
        return denegado
    data = request.get_json()
    if not data or 'name' not in data:
        return jsonify({"error": "name is required"}), 400

    hub_id = f"b.mdc_{re.sub(r'[^a-z0-9]', '_', data['name'].lower())}_{int(time.time()) % 100000}"
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO hubs (id, name, region, logo_url)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
            """, (hub_id, data['name'], data.get('region'), data.get('logo_url')))
            conn.commit()
        _auditar('portafolio_creado', hub_id, f"nombre='{data['name']}'")
        return jsonify({"id": hub_id, "name": data['name']}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── PROJECTS ────────────────────────────────────────────────────────────────

@projects_bp.route('/api/projects', methods=['GET'])
def list_all_projects():
    """Todos los proyectos agrupados por Hub. Usado por Landing Page."""
    # La identidad sale de la SESION, nunca de la query string. Antes bastaba
    # con pedir ?role=admin para saltarse el filtro de membresia y recibir el
    # catalogo entero: el rol se leia de la URL, que la pone quien llama.
    sesion = getattr(g, 'current_user', None)
    if sesion:
        user_id = sesion.get('id')
        role = sesion.get('role', 'user')
    else:
        # Lector anonimo (vistas compartidas): ve lo minimo y nunca el codigo
        # de invitacion.
        user_id = None
        role = 'anon'
    es_admin = role == 'admin'

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            query = """
                SELECT p.id, p.hub_id, p.name, p.description, p.model_urn,
                       p.thumbnail_url, p.status, p.project_type,
                       p.start_date, p.end_date, p.updated_at,
                       h.name AS hub_name, h.region, p.invite_code
                FROM projects p
                LEFT JOIN hubs h ON h.id = p.hub_id
                WHERE p.status != 'archived'
            """
            params = []

            # Anonimo: lista VACIA. Antes, con user_id None la condicion de
            # abajo era falsa y la consulta salia SIN filtro, asi que un visitante
            # sin sesion recibia el catalogo completo de obras con sus model_urn
            # -- justo lo que el comentario de arriba decia estar evitando.
            if not es_admin and not user_id:
                return jsonify({"projects": []}), 200

            # Si no es admin, filtrar por los proyectos asignados en project_users
            if not es_admin and user_id:
                query += " AND p.id IN (SELECT project_id FROM project_users WHERE user_id = %s)"
                params.append(user_id)

            query += " ORDER BY h.name, p.name"
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            projects = [{
                "id": r[0], "hub_id": r[1], "name": r[2], "description": r[3],
                "model_urn": r[4], "thumbnail_url": r[5], "status": r[6],
                "project_type": r[7],
                "start_date": r[8].isoformat() if r[8] else None,
                "end_date": r[9].isoformat() if r[9] else None,
                "updated_at": r[10].isoformat() if r[10] else None,
                "hub_name": r[11] or "Sin Municipalidad",
                "region": r[12],
                # El invite_code es la llave de auto-inscripcion a la obra
                # (POST /api/projects/join). Solo lo ve un admin.
                "invite_code": r[13] if es_admin else None
            } for r in rows]
        return jsonify({"projects": projects}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@projects_bp.route('/api/hubs/<hub_id>/projects', methods=['GET'])
def list_hub_projects(hub_id):
    """Lista proyectos de un hub especifico."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, hub_id, name, description, model_urn,
                       thumbnail_url, status, project_type,
                       start_date, end_date, updated_at, metadata
                FROM projects
                WHERE hub_id = %s AND status != 'archived'
                ORDER BY name
            """, (hub_id,))
            rows = cursor.fetchall()
            projects = [{
                "id": r[0], "hub_id": r[1], "name": r[2], "description": r[3],
                "model_urn": r[4], "thumbnail_url": r[5], "status": r[6],
                "project_type": r[7],
                "start_date": r[8].isoformat() if r[8] else None,
                "end_date": r[9].isoformat() if r[9] else None,
                "updated_at": r[10].isoformat() if r[10] else None,
                "metadata": r[11] or {}
            } for r in rows]
        return jsonify({"projects": projects}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@projects_bp.route('/api/hubs/<hub_id>/projects', methods=['POST'])
@requiere_rol('admin')
def create_hub_project(hub_id):
    """Crear un nuevo proyecto dentro de un hub."""
    denegado = _solo_admin('crear obras')
    if denegado:
        return denegado
    data = request.get_json()
    if not data or 'name' not in data:
        return jsonify({"error": "name is required"}), 400

    proj_id = f"b.proj_{re.sub(r'[^a-z0-9]', '_', data['name'].lower())}_{int(time.time()) % 100000}"
    invite_code = _codigo_de_invitacion()
    
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO projects
                    (id, hub_id, name, description, model_urn, thumbnail_url,
                     status, project_type, start_date, end_date, metadata, invite_code)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                proj_id, hub_id, data['name'],
                data.get('description', ''),
                data.get('model_urn', proj_id),
                data.get('thumbnail_url'),
                data.get('status', 'active'),
                data.get('project_type', 'Infraestructura'),
                data.get('start_date'),
                data.get('end_date'),
                json.dumps(data.get('metadata', {})),
                invite_code
            ))
            conn.commit()

            # Auto-crear estructura profesional estilo ACC (ISO 19650)
            try:
                from file_system_db import resolve_path_to_node_id
                folders_to_create = [
                    "01_Gestion_de_Proyecto",
                    "02_Planos_Aprobados",
                    "03_Modelos_BIM",
                    "04_Fotos_de_Campo",
                    "04_Fotos_de_Campo/01_Enero", # Ejemplo de subestructura
                    "04_Fotos_de_Campo/02_Febrero",
                    "05_Informes_Semanales",
                    "06_Minutas_y_Contratos"
                ]
                for folder in folders_to_create:
                    resolve_path_to_node_id(folder, proj_id)
            except Exception as fe:
                print(f"[projects] Warning: no se crearon carpetas raiz: {fe}")

        _auditar('obra_creada', proj_id, f"nombre='{data['name']}' hub={hub_id}")
        # Retornar model_urn para que los frontends lo usen como fuente de verdad
        return jsonify({"id": proj_id, "hub_id": hub_id, "name": data['name'], "model_urn": data.get('model_urn', proj_id)}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@projects_bp.route('/api/projects', methods=['POST'])
@requiere_rol('admin')
def create_project_legacy():
    """Fallback para crear proyectos sin especificar hub (usando el Hub default legacy)."""
    return create_hub_project('b.mdc_default_legacy')


@projects_bp.route('/api/projects/<project_id>', methods=['GET'])
def get_project(project_id):
    """Detalles de un proyecto especifico."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT p.id, p.hub_id, p.name, p.description, p.model_urn,
                       p.thumbnail_url, p.status, p.project_type,
                       p.start_date, p.end_date, p.created_at, p.updated_at, p.metadata,
                       h.name AS hub_name, h.region
                FROM projects p
                LEFT JOIN hubs h ON h.id = p.hub_id
                WHERE p.id = %s
            """, (project_id,))
            r = cursor.fetchone()
            if not r:
                return jsonify({"error": "Project not found"}), 404
            return jsonify({
                "id": r[0], "hub_id": r[1], "name": r[2], "description": r[3],
                "model_urn": r[4], "thumbnail_url": r[5], "status": r[6],
                "project_type": r[7],
                "start_date": r[8].isoformat() if r[8] else None,
                "end_date": r[9].isoformat() if r[9] else None,
                "created_at": r[10].isoformat() if r[10] else None,
                "updated_at": r[11].isoformat() if r[11] else None,
                "metadata": r[12] or {},
                "hub_name": r[13], "region": r[14], "invite_code": r[15] if len(r) > 15 else None
            }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def _codigo_de_invitacion(largo=8):
    """La llave de auto-inscripcion a una obra. Con `secrets`, no con `random`.

    `random.choices` usa Mersenne Twister: no es criptografico y su estado se
    puede reconstruir observando salidas suficientes. Para un color de grafico
    da igual; para lo unico que hace falta saber para meterse en una obra, no.
    Y de 6 a 8 caracteres: 36^8 son 2,8 billones en vez de 2.180 millones.

    Los codigos YA emitidos siguen valiendo -- no se invalidan solos -- pero
    son de 6 caracteres y de `random`. Rotarlos es decision del propietario:
    romperia las invitaciones repartidas.
    """
    import secrets
    import string
    alfabeto = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alfabeto) for _ in range(largo))


@projects_bp.route('/api/projects/join', methods=['POST'])
@limite('10 per hour')
def join_project():
    """Unirse a un proyecto usando su invite_code."""
    data = request.get_json() or {}
    code = (data.get('invite_code') or '').strip().upper()

    # Uno se inscribe a SI MISMO. Antes el user_id venia del cuerpo, asi que con
    # un codigo de invitacion se podia meter en la obra a cualquier tercero.
    sesion = getattr(g, 'current_user', None)
    if not sesion:
        return jsonify({"error": "Autenticación requerida", "code": "NO_TOKEN"}), 401
    user_id = sesion.get('id')

    if not code:
        return jsonify({"error": "Código de invitación requerido"}), 400


    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # Buscar el proyecto y asegurar que no esté archivado
            cursor.execute("SELECT id, name FROM projects WHERE invite_code = %s AND status != 'archived'", (code,))
            proj = cursor.fetchone()
            
            if not proj:
                return jsonify({"error": "Código de invitación inválido o caducado"}), 404
                
            project_id, project_name = proj
            
            # Asignar al usuario
            cursor.execute('''
                INSERT INTO project_users (project_id, user_id)
                VALUES (%s, %s)
                ON CONFLICT DO NOTHING
            ''', (project_id, user_id))
            conn.commit()

        _auditar('obra_ingreso_por_codigo', project_id, f"nombre='{project_name}'")
        return jsonify({"success": True, "project_id": project_id, "project_name": project_name}), 200
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@projects_bp.route('/api/projects/<project_id>', methods=['PUT'])
@requiere_rol('admin')
def update_project(project_id):
    """Actualiza metadatos del proyecto (ej: vincular model_urn de APS)."""
    denegado = _solo_admin('modificar una obra')
    if denegado:
        return denegado
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data"}), 400
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # Se lee el estado ANTERIOR para poder registrar que cambio de que a
            # que. Sin el valor previo, "alguien modifico la obra" no sirve para
            # reconstruir nada.
            cursor.execute("SELECT name, status, model_urn FROM projects WHERE id = %s", (project_id,))
            _antes = cursor.fetchone() or (None, None, None)
            cursor.execute("""
                UPDATE projects SET
                    name = COALESCE(%s, name),
                    description = COALESCE(%s, description),
                    model_urn = COALESCE(%s, model_urn),
                    thumbnail_url = COALESCE(%s, thumbnail_url),
                    status = COALESCE(%s, status),
                    project_type = COALESCE(%s, project_type),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (
                data.get('name'), data.get('description'), data.get('model_urn'),
                data.get('thumbnail_url'), data.get('status'), data.get('project_type'),
                project_id
            ))
            conn.commit()

        cambios = []
        for campo, previo, nuevo in (('nombre', _antes[0], data.get('name')),
                                     ('estado', _antes[1], data.get('status')),
                                     ('model_urn', _antes[2], data.get('model_urn'))):
            if nuevo is not None and str(nuevo) != str(previo):
                cambios.append(f"{campo}: '{previo}' -> '{nuevo}'")
        _auditar('obra_modificada', project_id, ' · '.join(cambios) or 'sin cambios de fondo')
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@projects_bp.route('/api/projects/<project_id>', methods=['DELETE'])
@requiere_rol('admin')
def delete_project(project_id):
    """Archiva un proyecto (soft delete)."""
    denegado = _solo_admin('archivar una obra')
    if denegado:
        return denegado
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM projects WHERE id = %s", (project_id,))
            _nombre = (cursor.fetchone() or [None])[0]
            cursor.execute("UPDATE projects SET status = 'archived' WHERE id = %s", (project_id,))
            conn.commit()
        _auditar('obra_archivada', project_id, f"nombre='{_nombre}'")
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
